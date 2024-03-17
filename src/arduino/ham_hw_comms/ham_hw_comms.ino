/*
   HAM HW Commuinication

   Refences:
    https://www.ascii-code.com
    https://store-usa.arduino.cc/products/arduino-uno-rev3
    https://content.arduino.cc/assets/A000066-pinout.png

    https://www.ti.com/lit/ds/symlink/drv8231a.pdf
   ┏━━━━━━━━━━┯━━━━━━━━━━┯━━━━━━━━━━┯━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   ┃   IN1    │   IN2    │   OUT1   │   OUT2   │                          Description                                 ┃
   ┠──────────┼──────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────┨
   ┃    0     │    0     │  High-Z  │ High-Z   │ Coast; H-bridge disabled to High-Z (sleep entered after 1ms)         ┃
   ┠──────────┼──────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────┨
   ┃    0     │    1     │    L     │    H     │ Reverse (Current OUT2 -> OUT1)                                       ┃
   ┠──────────┼──────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────┨
   ┃    1     │    0     │    H     │    L     │ Forward (Current OUT1 -> OUT2)                                       ┃
   ┠──────────┼──────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────┨
   ┃    1     │    1     │    L     │    L     │ Brake; low-side slow decay                                           ┃
   ┗━━━━━━━━━━┷━━━━━━━━━━┷━━━━━━━━━━┷━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

*/
#include <stdbool.h>
#include <util/crc16.h>
#include <stdarg.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Adafruit_NeoPixel.h>

//int 16bits
//long 32 bits

#define ENABLE_LOGGING
#define LOG_DEBUG "Debug"
#define LOG_WARN  "Warning"
#define LOG_INFO  "Info"
#define LOG_ERROR "Error"

#define MAIN_LOOP_DELAY 10

//-- NeoPixel -----------
#define LED_PIN    6
#define LED_COUNT  8

//-- ADS/I2C ------------
#define ADDR_ADS_1 0x48
#define ADDR_ADS_2 0x49

//--- TX message layout --- 24 bytes including CRC and TX_DELIM. Word indexes
#define ADS1_PIN_0_IDX        0
#define ADS1_PIN_1_IDX        1
#define ADS1_PIN_2_IDX        2
#define ADS1_PIN_3_IDX        3
#define ADS2_PIN_0_IDX        4
#define ADS2_PIN_1_IDX        5
#define ADS2_PIN_2_IDX        6
#define ADS2_PIN_3_IDX        7
#define EXTRA_BITS_IDX        8
#define CONTENT_SZ            9

#define MOTOR_OVERCURRENT_BIT 0
#define DOOR_SWITCH_BIT       1
#define MOTOR_LIMIT_ONE_BIT   2
#define MOTOR_LIMIT_TWO_BIT   3


//---- Pins ----
#define OVERCURRENT_PIN      2
#define MOTOR_PIN1           4
#define MOTOR_PIN2           5
#define MOTOR_LIMIT_ONE_PIN  10
#define MOTOR_LIMIT_TWO_PIN  11
#define NEOPIXEL             6
#define DOOR_SWITCH_PIN      7
#define IR_ENABLE_PIN1       8
#define IR_ENABLE_PIN2       9

//---- ADS1015 ----
//left side
#define ADS1_PIN_0  0
#define ADS1_PIN_1  1
#define ADS1_PIN_2  2
#define ADS1_PIN_3  3
//Right side
#define ADS2_PIN_0  0
#define ADS2_PIN_1  1
#define ADS2_PIN_2  2
#define ADS2_PIN_3  3


//--- RX msg/Commands Layout ---
//--- Message --- byte index
#define CMD_OPCODE_IDX      0
#define CMD_CRC_IDX         1 // Reuse the same crc16 code
// high byte                2
//- NeoPixel Command -
#define CMD_SEGMENT_ID_IDX  3
#define CMD_COLOR_RED_IDX   4
#define CMD_COLOR_BLUE_IDX  5
#define CMD_COLOR_GREEN_IDX 6

//TODO: Remove ===============
#define RED       (MOTOR_PIN1)
#define GREEN     (MOTOR_PIN2)
#define BLUE       3
//=============================

// Motor Command
#define CMD_MOTOR_IDX       3

#define CMD_OPCODE_MOTOR       67  // C
#define CMD_OPCODE_LED         73  // I
#define CMD_OPCODE_GPIO        52  // R
#define CMD_OPCODE_PIN_SETUP   52  // E

#define CMD_MAX_SZ          16
#define CMD_HEADER_SZ       4
#define CMD_CRC_SZ          2
#define CMD_OPCODE_SZ       1

#define CMD_MOTOR_PARAM_SZ  1
#define CMD_MOTOR_CMD_SZ    (CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_MOTOR_PARAM_SZ)
#define CMD_MOTOR_BRAKE  0
#define CMD_MOTOR_STOP   1
#define CMD_MOTOR_CCW    2
#define CMD_MOTOR_CW     3

#define CMD_PIXEL_PARAM_SZ  6
#define CMD_PIXEL_CMD_SZ    (CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_PIXEL_PARAM_SZ)

// The Arduino Uno has 14 Digital I/O pins. Increase the byte count for more GPIO
// Bit map to control GPIO pins. 1 on 0 off.    76543210   FEDCBA98
#define CMD_GPIO_PARAM_SZ  2  // 2 bytes      0b00000000 0b00000000
#define CMD_GPIO_CMD_SZ    (CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_GPIO_PARAM_SZ)

#define CMD_STATE_HEADER_SEARCH  0
#define CMD_STATE_HEADER_FOUND   1
#define CMD_STATE_READ_CRC       2
#define CMD_STATE_READ_OPCODE    3
#define CMD_STATE_READ_MOTOR_CMD 4
#define CMD_STATE_READ_PIXEL_CMD 5
#define CMD_STATE_READ_GPIO_CMD  6
#define CMD_STATE_VALIDATE_CMD   7
#define CMD_STATE_RESET          8
#define CMD_STATE_CHECK_OPCODE   9
#define CMD_STATE_PIN_SETUP      10
#define CMD_NUMBER_OF_STATES     11

//--- Time ---
#define ONE_SECOND 1000000
//------------------------

/*
Basic layout                Example Motor command              Example Pixel Command                    Example GPIO Command
┏━━━━━━━━━━┓                  ┏━━━━━━━━━━━━━┓                  ┏━━━━━━━━━━┓                             ┏━━━━━━━━━━┓
┃ HEADER   ┃ 4 bytes          ┃   HEADER    ┃ 4 bytes          ┃ HEADER   ┃ 4 bytes                     ┃ HEADER   ┃ 4 bytes
┠──────────┨                  ┠─────────────┨                  ┠──────────┨                             ┠──────────┨
┃ CRC      ┃ 2 bytes          ┃   CRC       ┃ 2 bytes          ┃ CRC      ┃ 2 bytes                     ┃ CRC      ┃ 2 bytes
┠──────────┨                  ┠─────────────┨                  ┠──────────┨                             ┠──────────┨
┃ OPCODE   ┃ 1 byte           ┃   67        ┃ 1 byte           ┃ 73       ┃ 1 byte                      ┃ 52       ┃ 1 byte
┠──────────┨                  ┠─────────────┨                  ┠──────────┨                             ┠──────────┨
┃ PARAM 1  ┃ 1 byte           ┃ 0b00000001  ┃ 1 byte (Pins)    ┃ 120      ┃ 1 byte (strip length)       ┃ 0x00     ┃ 1 byte (Pins 0-7)
┠──────────┨                  ┗━━━━━━━━━━━━━┛                  ┠──────────┨                             ┠──────────┨
┃ PARAM N  ┃ N bytes                                           ┃ 1        ┃ 1 byte (Start index)        ┃ 0x00     ┃ 1 byte (Pins 8-F)
┗━━━━━━━━━━┛                                                   ┠──────────┨                             ┗━━━━━━━━━━┛
                                                               ┃ 5        ┃ 1 byte (length)
                                                               ┠──────────┨
                                                               ┃ 0xFF     ┃ 1 byte (red)
                                                               ┠──────────┨
                                                               ┃ 0x00     ┃ 1 byte (green)
                                                               ┠──────────┨
                                                               ┃ 0x0F     ┃ 1 byte (blue)
                                                               ┗━━━━━━━━━━┛

Example command: Motor command;
STEVq C?

*/
//------------------------------------

void pinSetup(uint16_t);
void readPeripherals();
void readIR();
void readGPIO();
void sendMessage();
uint16_t calcCRC();
void sendBinary(uint16_t);
void sendBinary(uint32_t);
void irSetup();
void neoPixelSetup();

//--- TX ----------------
const uint32_t TX_DELIM = 0xDEADBEAF; // 222 173 190 175
uint16_t msg[CONTENT_SZ];
//-----------------------

//--- RX Command ---
void cmd_parseCommands();
void cmd_processStates();
void cmd_headerSearch();
void cmd_headerFound();
void cmd_parseCRC();
void cmd_validateCRC();
void cmd_parseOptCode();
void cmd_parseMotorCmd();
void cmd_parsePixelCmd();
void cmd_parseGPIOCmd();
void cmd_parseCmd(size_t);
void cmd_reset();
void cmd_checkOpCode();
void cmd_executeMotorCmd();
void cmd_executePixelCmd();
void cmd_executeGPIOCmd();
void cmd_pinSetup(uint16_t);
int cmd_getCmdLength();
uint8_t cmd_getOpCode();
uint16_t cmd_getCRC();
uint8_t cmd_insertIntoBuffer();
bool cmd_isValidCommand();

//--- Types ---
typedef bool (*handler_t)();
//--- Data  ---
const uint32_t CMD_DELIM = 0x53544556; // STEV Temp for testing
uint8_t commandBuffer[CMD_MAX_SZ+1]; //+1 for debugging purposes. I'd like to print as a string, last char needs to be \0
uint32_t cmdDelim = 0;
int cmdReadState = CMD_STATE_HEADER_SEARCH;
int cmdStartIdx      = 0;
int parsedByteCount  = 0;
int commandBufIdx    = 0;
handler_t handlers[] = { //State Handlers
    [CMD_STATE_HEADER_SEARCH]  = &cmd_headerSearch,
    [CMD_STATE_HEADER_FOUND]   = &cmd_headerFound,
    [CMD_STATE_READ_CRC]       = &cmd_parseCRC,
    [CMD_STATE_READ_OPCODE]    = &cmd_parseOptCode,
    [CMD_STATE_READ_MOTOR_CMD] = &cmd_parseMotorCmd,
    [CMD_STATE_READ_PIXEL_CMD] = &cmd_parsePixelCmd,
    [CMD_STATE_READ_GPIO_CMD]  = &cmd_parseGPIOCmd,
    [CMD_STATE_VALIDATE_CMD]   = &cmd_validateCRC,
    [CMD_STATE_RESET]          = &cmd_reset,
    [CMD_STATE_CHECK_OPCODE]   = &cmd_checkOpCode,
    [CMD_STATE_PIN_SETUP]      = &cmd_pinSetup
};
//--- Timing ---
unsigned long startTime = 0,
              frameTime = 0,
              runTime = 0;
//--------------
//----- NeoPixel ------------------------
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
//----- IR ------------------------------
Adafruit_ADS1015 ads1015_1;
Adafruit_ADS1015 ads1015_2;

void setup() {
  //--- TODO: Remove --------------------------
  pinMode(BLUE, OUTPUT);
  digitalWrite(BLUE, HIGH);
  //-------------------------------------------

  irSetup();
  neoPixelSetup();
  pinSetup();
  Serial.begin(9600);
  startTime = frameTime = micros();
}

void loop() {
  readPeripherals();
  sendMessage();
  cmd_parseCommands();
  delay(10);

  runTime = micros() - startTime;
  frameTime = micros() - frameTime;
}

// ==================================================
void readPeripherals() {
    readIR();
    readGPIO();
}

void readGPIO() {
    msg[EXTRA_BITS_IDX] = digitalRead(MOTOR_LIMIT_ONE_PIN) ? msg[EXTRA_BITS_IDX] | (1 << MOTOR_LIMIT_ONE_BIT  ) : msg[EXTRA_BITS_IDX] & ~(1 << MOTOR_LIMIT_ONE_BIT  );
    msg[EXTRA_BITS_IDX] = digitalRead(MOTOR_LIMIT_TWO_PIN) ? msg[EXTRA_BITS_IDX] | (1 << MOTOR_LIMIT_TWO_BIT  ) : msg[EXTRA_BITS_IDX] & ~(1 << MOTOR_LIMIT_TWO_BIT  );
    msg[EXTRA_BITS_IDX] = digitalRead(DOOR_SWITCH_PIN)     ? msg[EXTRA_BITS_IDX] | (1 << DOOR_SWITCH_BIT      ) : msg[EXTRA_BITS_IDX] & ~(1 << DOOR_SWITCH_BIT      );
    msg[EXTRA_BITS_IDX] = digitalRead(OVERCURRENT_PIN)     ? msg[EXTRA_BITS_IDX] | (1 << MOTOR_OVERCURRENT_BIT) : msg[EXTRA_BITS_IDX] & ~(1 << MOTOR_OVERCURRENT_BIT);
}

void readIR() {
    //results = ads1015.readADC_Differential_0_1();
    //Note will be stored little endian
    msg[ADS1_PIN_0_IDX] = 0x4142; // 65 66
    msg[ADS1_PIN_1_IDX] = 0x4344; // 67 68
    msg[ADS1_PIN_2_IDX] = 0x4546; // 69 70
    msg[ADS1_PIN_3_IDX] = 0x4748; // 71 72
    msg[ADS2_PIN_0_IDX] = 0x494A; // 73 74
    msg[ADS2_PIN_1_IDX] = 0x4B4C; // 75 76
    msg[ADS2_PIN_2_IDX] = 0x4D4E; // 77 78
    msg[ADS2_PIN_3_IDX] = 0x4F50; // 79 80

    /* msg[ADS1_PIN_0_IDX] = ads1015_1.readADC_SingleEnded(ADS1_PIN_0); */
    /* msg[ADS1_PIN_1_IDX] = ads1015_2.readADC_SingleEnded(ADS1_PIN_1); */
    /* msg[ADS1_PIN_2_IDX] = ads1015_1.readADC_SingleEnded(ADS1_PIN_2); */
    /* msg[ADS1_PIN_3_IDX] = ads1015_2.readADC_SingleEnded(ADS1_PIN_3); */
    /* msg[ADS2_PIN_0_IDX] = ads1015_1.readADC_SingleEnded(ADS2_PIN_0); */
    /* msg[ADS2_PIN_1_IDX] = ads1015_2.readADC_SingleEnded(ADS2_PIN_1); */
    /* msg[ADS2_PIN_2_IDX] = ads1015_1.readADC_SingleEnded(ADS2_PIN_2); */
    /* msg[ADS2_PIN_3_IDX] = ads1015_2.readADC_SingleEnded(ADS2_PIN_3); */
}

void sendMessage() {
  for (unsigned int i=0; i<CONTENT_SZ; i++) {
    sendBinary(msg[i]);
  }
  sendBinary(calcCRC());
  sendBinary(TX_DELIM);
}

uint16_t calcCRC() {
  uint16_t crc = 0;
  for (unsigned int i=0; i<CONTENT_SZ<<1; i++) {
    crc = _crc16_update (crc, ((uint8_t*)msg)[i]);
  }
  return crc;
}

// function to send the given integer value to the serial port
void sendBinary(uint16_t value) {
  Serial.write(lowByte(value));
  Serial.write(highByte(value));
}

// function to send the given long integer value to the serial port
void sendBinary(uint32_t value) {
  // send the higher 16 bit integer value:
  uint16_t temp = value >> 16;
  sendBinary(temp);
  temp = value & 0xFFFF;
  // send the low 16 bit integer value
  sendBinary(temp);
}

void pinSetup(uint16_t pinModes) {
    pinMode(MOTOR_PIN1, OUTPUT);
    pinMode(MOTOR_PIN2, OUTPUT);
    pinMode(MOTOR_LIMIT_ONE_PIN, INPUT_PULLUP);
    pinMode(MOTOR_LIMIT_TWO_PIN, INPUT_PULLUP);

    pinMode(IR_ENABLE_PIN1, OUTPUT);
    pinMode(IR_ENABLE_PIN2, OUTPUT);
    digitalWrite(IR_ENABLE_PIN1, HIGH);
    digitalWrite(IR_ENABLE_PIN2, HIGH);

    pinMode(OVERCURRENT_PIN, INPUT);
    pinMode(DOOR_SWITCH_PIN, INPUT);
}

void irSetup() {
   if(! ads1015_1.begin(ADDR_ADS_1)) {
       while (true){
           log(LOG_ERROR, "Failed to initialize ADS1.");
           delay(1000);
       }
   }
   if(! ads1015_2.begin(ADDR_ADS_2) ) {
       log(LOG_ERROR, "Failed to initialize ADS2.");
       while (true) {
           log(LOG_ERROR, "Failed to initialize ADS1.");
           delay(1000);
       }
   }
}

void neoPixelSetup() {
  strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip.show();            // Turn OFF all pixels ASAP
  strip.setBrightness(255); // Set BRIGHTNESS (max = 255)
}

// ============== Commands ========================
void cmd_parseCommands() {
    cmd_processStates();
    cmd_processStates();
    cmd_processStates();
    cmd_processStates();
}

void cmd_processStates() {
    if(cmdReadState >= 0 && cmdReadState < CMD_NUMBER_OF_STATES){
        (*handlers[cmdReadState])();
    }else{
        log(LOG_DEBUG, "Invalid command state");
        cmd_reset();
        logData();
    }
}

void cmd_headerSearch() {
    uint8_t c;
    if (Serial.available()) {
        log(LOG_DEBUG, "Searching for header...");
        c = cmd_insertIntoBuffer(Serial.read()); //read() returns -1 if buffer is empty
        cmdDelim = (cmdDelim << 8) | c;
        if(cmdDelim == CMD_DELIM){
            log(LOG_DEBUG, "Header found!");
            cmdReadState = CMD_STATE_HEADER_FOUND;
        }
        logData();
    }
}

void cmd_headerFound() {
    log(LOG_DEBUG, "Resetting buffer to fill with command.");
    cmd_reset();
    log(LOG_DEBUG, "Changing state to read the CRC.");
    cmdReadState = CMD_STATE_READ_CRC;
}

void cmd_parseCRC() {
    uint8_t c;
    if (Serial.available()) {
        c = cmd_insertIntoBuffer(Serial.read());
        log(LOG_DEBUG, "Parsing CRC...");
        parsedByteCount++;
        if(parsedByteCount == CMD_CRC_SZ){
            log(LOG_DEBUG, "CRC parsed");
            cmdReadState = CMD_STATE_READ_OPCODE;
        }else if (parsedByteCount > CMD_CRC_SZ) {
            cmdReadState = CMD_STATE_RESET;
        }
        logData();
    }
}

void cmd_parseOptCode() {
    uint8_t c;
    if (Serial.available()) {
        log(LOG_DEBUG, "Parsing OpCode...");
        c = cmd_insertIntoBuffer(Serial.read());
        parsedByteCount++;
        switch(c) {
        case CMD_OPCODE_MOTOR:
            log(LOG_DEBUG, "Found motor opcode");
            cmdReadState = CMD_STATE_READ_MOTOR_CMD;
            break;
        case CMD_OPCODE_LED:
            log(LOG_DEBUG, "Found pixel opcode");
            cmdReadState = CMD_STATE_READ_PIXEL_CMD;
            break;
        case CMD_OPCODE_GPIO:
            log(LOG_DEBUG, "Found gpio opcode");
            cmdReadState = CMD_STATE_READ_GPIO_CMD;
            break;
        case CMD_OPCODE_PIN_SETUP:
            log(LOG_DEBUG, "Not implemented");
            cmdReadState = CMD_STATE_RESET;
            break;
        default:
            log(LOG_DEBUG, "Invalid op code");
            cmdReadState = CMD_STATE_RESET;
        }
    }
}

void cmd_parseMotorCmd() {
    log(LOG_DEBUG, "Parsing Motor Cmd...");
    cmd_parseCmd(CMD_MOTOR_PARAM_SZ);
}

void cmd_parsePixelCmd() {
    log(LOG_DEBUG, "Parsing Pixel Cmd...");
    cmd_parseCmd(CMD_PIXEL_PARAM_SZ);
}

void cmd_parseGPIOCmd() {
    log(LOG_DEBUG, "Parsing GPIO Cmd...");
    cmd_parseCmd(CMD_GPIO_PARAM_SZ);
}

void cmd_parseCmd(size_t paramSz) {
    uint8_t c;
    if (Serial.available()) {
        c = cmd_insertIntoBuffer(Serial.read());
        parsedByteCount++;
        if(parsedByteCount == CMD_CRC_SZ + CMD_OPCODE_SZ + paramSz) {
            cmdReadState = CMD_STATE_VALIDATE_CMD;
        }else if(parsedByteCount > CMD_CRC_SZ + CMD_OPCODE_SZ + paramSz) {
            cmdReadState = CMD_STATE_RESET;
        }
        logData();
    }
}

void cmd_checkOpCode() {
    log(LOG_DEBUG, "Checking op code");
    switch(cmd_getOpCode()) {
        case CMD_OPCODE_MOTOR:
            log(LOG_DEBUG, "Executing motor command");
            cmd_executeMotorCmd();
            break;
        case CMD_OPCODE_LED:
            log(LOG_DEBUG, "Executing led command");
            cmd_executePixelCmd();
            break;
        case CMD_OPCODE_GPIO:
            log(LOG_DEBUG, "Executing GPIO command");
            cmd_executeGPIOCmd();
            break;
        default:
            log(LOG_DEBUG, "Invalid op code");
            cmdReadState = CMD_STATE_RESET;
    }
}

void cmd_executeMotorCmd() {
    uint8_t param = commandBuffer[CMD_CRC_SZ + CMD_OPCODE_SZ]; //Skip the CRC
    switch(param) {
    case CMD_MOTOR_CW:
        cmd_motorCW();
        break;
    case CMD_MOTOR_CCW:
        cmd_motorCCW();
        break;
    case CMD_MOTOR_BRAKE:
        cmd_motorBreak();
        break;
    case CMD_MOTOR_STOP:
        cmd_motorStop();
        break;
    default:
        log(LOG_DEBUG, "Unknown motor command");
    }
    cmdReadState = CMD_STATE_RESET;
}

void cmd_motorCW() {
    log(LOG_DEBUG, "Executing motor cw.");
    digitalWrite(MOTOR_PIN1, HIGH);
    digitalWrite(MOTOR_PIN2, LOW);
}

void cmd_motorCCW() {
    log(LOG_DEBUG, "Executing motor ccw.");
    digitalWrite(MOTOR_PIN1, LOW);
    digitalWrite(MOTOR_PIN2, HIGH);
}

void cmd_motorStop() {
    log(LOG_DEBUG, "Executing motor stop.");
    digitalWrite(MOTOR_PIN1, LOW);
    digitalWrite(MOTOR_PIN2, LOW);
}

void cmd_motorBrake() {
    log(LOG_DEBUG, "Executing motor brake.");
    digitalWrite(MOTOR_PIN1, HIGH);
    digitalWrite(MOTOR_PIN2, HIGH);
}

void cmd_executePixelCmd() {
    cmdReadState = CMD_STATE_RESET;
    for(int c=b; c<strip.numPixels(); c++) {
        strip.setPixelColor(c, color);
    }
    strip.show();
}

void cmd_pinSetup(uint16_t pinModes) {
    pinSetup(pinMode);
}

void cmd_executeGPIOCmd() {
    // Bit map to control GPIO pins. 1 on 0 off.
    //                76543210   FEDCBA98
    // 2 bytes      0b00000000 0b00000000
    uint8_t param;
    param = commandBuffer[CMD_CRC_SZ + CMD_OPCODE_SZ + 0];
    digitalWrite(0, (param>>0)&1);
    digitalWrite(1, (param>>1)&1);
    //digitalWrite(2, (param>>2)&1); // Overcurrent pin
    digitalWrite(3, (param>>3)&1);
    digitalWrite(4, (param>>4)&1);   // Motor pin 1
    digitalWrite(5, (param>>5)&1);   // Motor pin 2
    //digitalWrite(6, (param>>6)&1); // NeoPixel pin
    //digitalWrite(7, (param>>7)&1); // Door switch pin

    param = commandBuffer[CMD_CRC_SZ + CMD_OPCODE_SZ + 1];
    digitalWrite(8,  (param>>0)&1);
    digitalWrite(9,  (param>>1)&1);
    digitalWrite(10, (param>>2)&1);
    digitalWrite(11, (param>>3)&1);
    digitalWrite(12, (param>>4)&1);
    digitalWrite(13, (param>>5)&1);
    //digitalWrite(14, (param>>6)&1);
    //digitalWrite(15, (param>>7)&1);

}

void cmd_validateCRC() {
    log(LOG_DEBUG, "Validating CRC");
    if(cmd_isValidCommand()) {
        log(LOG_DEBUG, "Valid CRC");
        cmdReadState = CMD_STATE_CHECK_OPCODE;
    }else{
        log(LOG_DEBUG, "Invalid CRC");
        cmdReadState = CMD_STATE_RESET;
    }
}

uint8_t cmd_getOpCode(){
    return commandBuffer[CMD_CRC_SZ]; //Skip the CRC
}

uint16_t cmd_getCRC(){
    return commandBuffer[0];
}

int cmd_getCmdLength() {
  int t = commandBufIdx;
  if(commandBufIdx < cmdStartIdx) {
    t += CMD_MAX_SZ;
  }
  Serial.print("Cmd Length: "); Serial.println(t);

  return t - cmdStartIdx;
}

bool cmd_isValidCommand() {
    uint16_t crc = 0;

    for (unsigned int i=2; i<parsedByteCount; i++) {
        crc = _crc16_update (crc, commandBuffer[i]);
    }
    return (crc == *((uint16_t*)commandBuffer));
}

uint8_t cmd_insertIntoBuffer(uint8_t c) {
    commandBuffer[commandBufIdx++ %CMD_MAX_SZ] = c;
    return c;
}

void cmd_reset() {
    log(LOG_DEBUG, "Resetting command parser");
    parsedByteCount ^= parsedByteCount;
    commandBufIdx ^= commandBufIdx;
    cmdStartIdx ^= cmdStartIdx;
    cmdDelim ^= cmdDelim;
    cmdReadState = CMD_STATE_HEADER_SEARCH;
    logData();
}

//===========================================================

//====== Logging =====================
#ifdef ENABLE_LOGGING
size_t log(const char* type, const char* str) {
    size_t d = Serial.print("##");
    d += Serial.print(type);
    d += Serial.print(":");
    d += Serial.println(str);
    return d;
}

size_t log(const char *type, unsigned int noParams, ...) {
    size_t d = 0;
    const char *str;

    va_list ptr;
    va_start(ptr, noParams);

    d += Serial.print("##");
    d += Serial.print(type);
    d += Serial.print(":");
    for(unsigned int i=0; i<noParams - 1; i++) {
        str = va_arg(ptr, const char*);
        d += Serial.print(str);
    }
    str = va_arg(ptr, const char*);
    d += Serial.println(str);

    va_end(ptr);
    return d;
}

size_t logData() {
    size_t d = Serial.print("##Debug:Buffer = '");
    d += Serial.print((const char *)commandBuffer);
    d += Serial.print("'");
    d += Serial.print("  Delim= '");
    d += Serial.print(cmdDelim, HEX);
    d += Serial.println("'");
    return d;
}
#else
size_t log(const char* type, const char* str) {
    return 0;
}
size_t log(const char *type, unsigned int noParams, ...) {
    return 0;
}
size_t logData() {
    return 0;
}
#endif
//===========================================================
