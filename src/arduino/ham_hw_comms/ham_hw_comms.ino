/*
 * HAM HW Commuinication
 *
*/
#include <stdbool.h>
#include <util/crc16.h>
//int 16bits
//long 32 bits

//--- Transmit message layout --- 24 bytes including CRC and TX_DELIM. Word indexes
#define IR_FRONT_LEFT_IDX     0
#define IR_FRONT_RIGHT_IDX    1
#define IR_MIDDLE_LEFT_IDX    2
#define IR_MIDDLE_RIGHT_IDX   3
#define IR_REAR_LEFT_IDX      4
#define IR_REAR_RIGHT_IDX     5
#define IR_REAR_END_LEFT_IDX  6
#define IR_REAR_END_RIGHT_IDX 7
#define EXTRA_BITS_IDX        8
#define CONTENT_SZ            9

#define MOTOR_OVER_CURRENT_BIT 0b00000001
#define MAINTENANCE_DOOR_BIT   0b00000010

#define LOG_DEBUG "Debug"
#define LOG_WARN "Warning"
#define LOG_INFO "Info"

//--- Receive msg/Commands Layout ---
//--- Message --- byte index
#define CMD_OPCODE_IDX      0
#define CMD_CRC_IDX         1 // Reuse the same crc16 code
// high byte                2
//- NeoPixel Command -
#define CMD_SEGMENT_ID_IDX  3
#define CMD_COLOR_RED_IDX   4
#define CMD_COLOR_BLUE_IDX  5
#define CMD_COLOR_GREEN_IDX 6
// Motor Command
#define CMD_MOTOR_IDX       3

#define CMD_OPCODE_MOTOR    67  // C
#define CMD_OPCODE_LED      73  // I

#define CMD_MAX_SZ          16
#define CMD_HEADER_SZ       4
#define CMD_CRC_SZ          2
#define CMD_OPCODE_SZ       1

#define CMD_MOTOR_PARAM_SZ  1
#define CMD_MOTOR_CMD_SZ    (CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_MOTOR_PARAM_SZ)

#define CMD_PIXEL_PARAM_SZ  5
#define CMD_PIXEL_CMD_SZ    (CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_PIXEL_PARAM_SZ)

#define CMD_STATE_HEADER_SEARCH  1
#define CMD_STATE_READ_CRC       2
#define CMD_STATE_READ_OPCODE    3
#define CMD_STATE_READ_MOTOR_CMD 4
#define CMD_STATE_READ_PIXEL_CMD 5
#define CMD_STATE_VALIDATE_CMD   6
#define CMD_STATE_RESET          7
#define CMD_STATE_EXEC           8

/*
Basic layout                Example Motor command              Example Pixel Command
┏━━━━━━━━━━┓                  ┏━━━━━━━━━━━━━┓                  ┏━━━━━━━━━━┓
┃ HEADER   ┃ 4 bytes          ┃   HEADER    ┃ 4 bytes          ┃ HEADER   ┃ 4 bytes
┠──────────┨                  ┠─────────────┨                  ┠──────────┨
┃ CRC      ┃ 2 bytes          ┃   CRC       ┃ 2 bytes          ┃ CRC      ┃ 2 bytes
┠──────────┨                  ┠─────────────┨                  ┠──────────┨
┃ OPCODE   ┃ 1 byte           ┃   67        ┃ 1 byte           ┃ 73       ┃ 1 byte
┠──────────┨                  ┠─────────────┨                  ┠──────────┨
┃ PARAM 1  ┃ 1 byte           ┃ 0b00000001  ┃ 1 byte (Pins)    ┃ 1        ┃ 1 byte (Start index)
┠──────────┨                  ┗━━━━━━━━━━━━━┛                  ┠──────────┨
┃ PARAM N  ┃ N bytes                                           ┃ 5        ┃ 1 byte (length)
┗━━━━━━━━━━┛                                                   ┠──────────┨
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

const uint32_t TX_DELIM = 0xDEADBEAF; // 222 173 190 175
uint16_t msg[CONTENT_SZ];

//--- RX Command Data ---
const uint32_t CMD_DELIM = 0x53544556; // STEV Temp for testing
uint8_t commandBuffer[CMD_MAX_SZ+1]; //+1 for debugging purposes. I'd like to print as a string, last char needs to be \0
uint32_t cmdDelim = 0;
int cmdReadState = CMD_STATE_HEADER_SEARCH;
int cmdStartIdx      = 0;
int parsedByteCount  = 0;
int commandBufIdx    = 0;
//----------------------

void setup() {
  Serial.begin(9600);
  //Note will be stored little endian
  msg[IR_FRONT_LEFT_IDX]     = 0x4142; // 65 66
  msg[IR_FRONT_RIGHT_IDX]    = 0x4344; // 67 68
  msg[IR_MIDDLE_LEFT_IDX]    = 0x4546; // 69 70
  msg[IR_MIDDLE_RIGHT_IDX]   = 0x4748; // 71 72
  msg[IR_REAR_LEFT_IDX]      = 0x494A; // 73 74
  msg[IR_REAR_RIGHT_IDX]     = 0x4B4C; // 75 76
  msg[IR_REAR_END_LEFT_IDX]  = 0x4D4E; // 77 78
  msg[IR_REAR_END_RIGHT_IDX] = 0x4F50; // 79 80
  msg[EXTRA_BITS_IDX]        = 0x5152; // 81 82
}

void loop() {
  //sendMessage();
  cmd_parseCommands();
  delay(10);
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

// Note: Serial.read has a 64byte buffer
uint32_t cmd_parseCommands() {
    cmd_processStates();
}

void cmd_processStates() {
    uint8_t c;
    switch(cmdReadState) {
        case CMD_STATE_HEADER_SEARCH:
            cmd_headerSearch();
            break;
        case CMD_STATE_READ_CRC:
            cmd_parseCRC();
            break;
        case CMD_STATE_READ_OPCODE:
            cmd_parseOptCode();
            break;
        case CMD_STATE_READ_MOTOR_CMD:
            cmd_parseMotorCmd();
            break;
        case CMD_STATE_READ_PIXEL_CMD:
            cmd_parsePixelCmd();
            break;
        case CMD_STATE_VALIDATE_CMD:
            cmd_validateCRC();
            break;
        case CMD_STATE_EXEC:
            Serial.println("Executing command");
            cmdReadState = CMD_STATE_RESET;
            break;
        case CMD_STATE_RESET:
            log(LOG_DEBUG, "Resetting command parser");
            cmd_reset();
            logData();
            break;
        default: //Invalid state
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
            cmd_reset();
            cmdReadState = CMD_STATE_READ_CRC;
        }
        logData();
    }
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
        default:
            log(LOG_DEBUG, "Invalid op code");
            cmd_reset();
        }
        logData();
    }
}

void cmd_parseMotorCmd() {
    uint8_t c;
    if (Serial.available()) {
        c = cmd_insertIntoBuffer(Serial.read());
        parsedByteCount++;
        log(LOG_DEBUG, "Parsing Motor Cmd...");
        if(parsedByteCount == CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_MOTOR_PARAM_SZ) {
            log(LOG_DEBUG, "Motor params parsed");
            cmdReadState = CMD_STATE_VALIDATE_CMD;
        }else if(parsedByteCount > CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_MOTOR_PARAM_SZ) {
            cmdReadState = CMD_STATE_RESET;
        }
        logData();
    }
}

void cmd_parsePixelCmd() {
    uint8_t c;
    if (Serial.available()) {
        log(LOG_DEBUG, "Parsing Pixel Cmd...");
        c = cmd_insertIntoBuffer(Serial.read());
        parsedByteCount++;
        if(parsedByteCount == CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_PIXEL_PARAM_SZ) {
            cmdReadState = CMD_STATE_VALIDATE_CMD;
        }else if(parsedByteCount > CMD_CRC_SZ + CMD_OPCODE_SZ + CMD_PIXEL_PARAM_SZ) {
            cmdReadState = CMD_STATE_RESET;
        }
        logData();
    }
}

void cmd_validateCRC() {
    log(LOG_DEBUG, "Validating CRC");
    if(cmd_isValidateCRC()) {
        log(LOG_DEBUG, "Valid CRC");
        cmdReadState = CMD_STATE_EXEC;
    }else{
        cmdReadState = CMD_STATE_RESET;
    }
}

int cmd_getCmdLength() {
  int t = commandBufIdx;
  if(commandBufIdx < cmdStartIdx) {
    t += CMD_MAX_SZ;
  }
  Serial.print("Cmd Length: "); Serial.println(t);

  return t - cmdStartIdx;
}

bool cmd_isValidateCRC() {
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
    parsedByteCount ^= parsedByteCount;
    commandBufIdx ^= commandBufIdx;
    cmdStartIdx ^= cmdStartIdx;
    cmdDelim ^= cmdDelim;
    cmdReadState = CMD_STATE_HEADER_SEARCH;
}

void cmd_printBuffer() {
    log("Debug", (const char*)commandBuffer);
}

size_t log(const char* type, const char* str) {
    size_t d = Serial.print("##");
    d += Serial.print(type);
    d += Serial.print(":");
    d += Serial.println(str);
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
