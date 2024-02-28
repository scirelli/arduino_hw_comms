/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/
#include <util/crc16.h>
//int 16bits
//long 32 bits

//Message Layout 24 bytes including CRC and FOOTER
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

//const unsigned long HEADER = 0xD00000DE;
const uint32_t FOOTER = 0xDEADBEAF; // 222 173 190 175
uint16_t msg[CONTENT_SZ];

void setup() {
  Serial.begin(9600);
}

void loop() {
  //Note will be stored little endian
  msg[0] = 0x4142; // 65 66
  msg[1] = 0x4344; // 67 68
  msg[2] = 0x4546; // 69 70
  msg[3] = 0x4748; // 71 72
  msg[4] = 0x494A; // 73 74
  msg[5] = 0x4B4C; // 75 76
  msg[6] = 0x4D4E; // 77 78
  msg[7] = 0x4F50; // 79 80
  msg[8] = 0x5152; // 81 82
  sendMessage();
  delay(1000);
}

void sendMessage() {
  for (unsigned int i=0; i<CONTENT_SZ; i++) {
    sendBinary(msg[i]);
  }
  sendBinary(calcCRC());
  sendBinary(FOOTER);
}

uint16_t calcCRC() {
  uint16_t crc = 0;
  for (unsigned int i=0; i<CONTENT_SZ<<1; i++) {
    crc = _crc16_update (crc, ((uint8_t*)msg)[i]); // update the crc value
    //Serial.print(", ");
    //Serial.print(((uint8_t*)msg)[i]);
  }
  //Serial.println("");
  //Serial.println(crc);
  return crc;
}

// function to send the given integer value to the serial port
void sendBinary(uint16_t value) {
  Serial.write(lowByte(value));   // send the low byte
  Serial.write(highByte(value));  // send the high byte
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

uint32_t readBinary() {
  uint32_t msg = 0;
  if (Serial.available() >= 4) {
    msg = msg | Serial.read() << 4;
    msg = msg | Serial.read() << 3;
    msg = msg | Serial.read() << 2;
    msg = msg | Serial.read() << 1;
  }
  return msg;
}
