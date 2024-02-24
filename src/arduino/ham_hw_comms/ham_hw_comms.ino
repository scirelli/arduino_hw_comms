/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/
//int 16bits
//long 32 bits

const unsigned long HEADER = 0xD00000DE;
const unsigned long FOOTER = 0xDEADBEAF;
//const unsigned long HEADER = 0x41424344;
//const unsigned long FOOTER = 0x45464748;
unsigned int intValue;
unsigned long longValue;

void setup() {
  Serial.begin(9600);
}

void loop() {
  sendBinary(HEADER);
  Serial.print("ABCDEFG");
  sendBinary(FOOTER);
  delay(1000);
}

// function to send the given integer value to the serial port
void sendBinary(unsigned int value) {
  Serial.write(highByte(value));  // send the high byte
  Serial.write(lowByte(value));   // send the low byte
}

// function to send the given long integer value to the serial port
void sendBinary(unsigned long value) {
  // send the higher 16 bit integer value:
  unsigned temp = value >> 16; 
  sendBinary(temp);
  temp = value & 0xFFFF;
  // send the low 16 bit integer value
  sendBinary(temp);
}

unsigned long readBinary() {
  unsigned long msg = 0;
  if (Serial.available() >= 4) {
    msg = msg | Serial.read() << 4;
    msg = msg | Serial.read() << 3;
    msg = msg | Serial.read() << 2;
    msg = msg | Serial.read() << 1;
  }
  return msg;
}