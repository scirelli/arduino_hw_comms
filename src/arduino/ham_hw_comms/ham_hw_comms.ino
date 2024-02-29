/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/
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
#define CMD_MAX_SZ          16

#define CMD_OPCODE_MOTOR    67  // C
#define CMD_OPCODE_LED      73  // I

#define CMD_STATE_HEADER_SEARCH  1
#define CMD_STATE_OPCODE         2
#define CMD_STATE_READ_MOTOR_CMD 3
#define CMD_STATE_READ_PIXEL_CMD 4
#define CMD_STATE_RESET          5


const uint32_t TX_DELIM = 0xDEADBEAF; // 222 173 190 175
uint16_t msg[CONTENT_SZ];

//--- RX Command Data ---
const uint32_t CMD_DELIM = 0x54455645; // STEVE Temp for testing
uint8_t commandBuffer[CMD_MAX_SZ+1]; //+1 for debugging purposes. I'd like to print as a string, last char needs to be \0
uint32_t cmdDelim = 0;
int cmdReadState = CMD_STATE_HEADER_SEARCH;
int cmdStartIdx = 0;
int commandBufIdx = 0;
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
  cmd_parseCommand();
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
uint32_t cmd_parseCommand() {
    uint8_t c;

    if (Serial.available()) {
        c = Serial.read();
        cmd_insertIntoBuffer(c);

        switch(cmdReadState) {
            case CMD_STATE_HEADER_SEARCH:
                debugPrintln("Searching for header...");
                cmd_headerSearch(c);
                debugPrintData();
                break;
            case CMD_STATE_OPCODE:
                debugPrintln("Parsing OpCode...");
                cmd_parseOptCode(c);
                debugPrintData();
                break;
            case CMD_STATE_READ_MOTOR_CMD:
                debugPrintln("Parsing Motor Cmd...");
                cmd_parseMotorCmd(c);
                debugPrintData();
                break;
            case CMD_STATE_READ_PIXEL_CMD:
                debugPrintln("Parsing Pixel Cmd...");
                cmd_parsePixelCmd(c);
                debugPrintData();
                break;
            case CMD_STATE_CRC:
                debugPrintln("Parsing CRC...");
                cmd_parseCRC(c);
                debugPrintData();
                break;
            case CMD_STATE_RESET:
                debugPrintln("Resetting command parser");
                cmd_reset();
                debugPrintData();
                break;
            default: //Invalid state
                debugPrintln("Invalid command state");
                cmd_reset();
                debugPrintData();
        }
    }
}

void cmd_headerSearch(uint8_t c) {
    cmdDelim = (cmdDelim << 8) | c;
    if(cmdDelim == CMD_DELIM){
        cmdReadState = CMD_STATE_OPCODE;
    }
}

void cmd_parseOptCode(uint8_t c) {
    cmdStartIdx = commandBufIdx;
    switch(c) {
    case CMD_OPCODE_MOTOR:
        cmdReadState = CMD_STATE_READ_MOTOR_CMD;
        break;
    case CMD_OPCODE_LED:
        cmdReadState = CMD_STATE_READ_PIXEL_CMD;
        break;
    default:
        debugPrintln("Invalid op code");
        cmd_reset();
    }
}

void cmd_parseMotorCmd(uint8_t c) {
    cmdReadState = CMD_STATE_RESET;
}

void cmd_parsePixelCmd(uint8_t c) {
    cmdReadState = CMD_STATE_RESET;
}

void cmd_parseCRC(uint8_t c) {
    cmdReadState = CMD_STATE_OPCODE;
}

uint8_t cmd_insertIntoBuffer(uint8_t c) {
    commandBuffer[commandBufIdx++%CMD_MAX_SZ] = c;
    return c;
}

void cmd_reset() {
    commandBufIdx ^= commandBufIdx;
    cmdStartIdx ^= cmdStartIdx;
    cmdDelim ^= cmdDelim;
    cmdReadState = CMD_STATE_HEADER_SEARCH;
}

void cmd_printBuffer() {
    debugPrintln((const char*)commandBuffer);
}

size_t debugPrintln(const char* str) {
    return Serial.print(str);
}

size_t debugPrintData() {
    size_t d = Serial.print(" Buffer = '");
    d += Serial.print((const char *)commandBuffer);
    d += Serial.print("'");
    d += Serial.print("  Delim= '");
    d += Serial.print(cmdDelim, HEX);
    d += Serial.println("'");
    return d;
}
