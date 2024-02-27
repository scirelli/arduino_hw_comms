/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/
#include <util/crc16.h>
//int 16bits
//long 32 bits

//Message Layout
#define IR_FRONT_LEFT_IDX     0
#define IR_FRONT_RIGHT_IDX    1
#define IR_MIDDLE_LEFT_IDX    2
#define IR_MIDDLE_RIGHT_IDX   3
#define IR_REAR_LEFT_IDX      4
#define IR_REAR_RIGHT_IDX     5
#define IR_REAR_END_LEFT_IDX  6
#define IR_REAR_END_RIGHT_IDX 7
#define EXTRA_BITS_IDX        8
#define CRC_IDX               9
#define MESSAGE_SZ            10
#define MOTOR_OVER_CURRENT_BIT 0b00000001
#define MAINTENANCE_DOOR_BIT   0b00000010

//const unsigned long HEADER = 0xD00000DE;
const uint32_t FOOTER = 0xDEADBEAF;
uint16_t msg[MESSAGE_SZ];

void setup() {
  Serial.begin(9600);
}

void loop() {
  msg[0] = 0x4142;
  msg[1] = 0x4344;
  msg[2] = 0x4546;
  msg[3] = 0x4748;
  msg[4] = 0x494A;
  msg[5] = 0x4B4C;
  msg[6] = 0x4D4E;
  msg[7] = 0x4F50;
  msg[8] = 0x5152;
  sendMessage();
  delay(1000);
}

void sendMessage() {
  for (unsigned int i=0; i<MESSAGE_SZ; i++) {
    sendBinary(msg[i]);
  }
  sendBinary(calcCRC());
  sendBinary(FOOTER);
}

uint16_t calcCRC() {
  uint16_t crc = 0;
  for (unsigned int i=0; i<MESSAGE_SZ<<1; i++) {
    crc = _crc16_update (crc, ((uint8_t*)msg)[i]); // update the crc value
  }
  //Serial.println(crc);
  return crc;
}

// function to send the given integer value to the serial port
void sendBinary(uint16_t value) {
  Serial.write(highByte(value));  // send the high byte
  Serial.write(lowByte(value));   // send the low byte
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
