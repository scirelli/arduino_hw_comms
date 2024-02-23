/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/
//int 16bits
//long 32 bits

const unsigned long HEADER = 0xD00000DE;
const unsigned long FOOTER = 0xDEADBEAF;

unsigned int intValue;
unsigned long longValue;

void setup() {
  Serial.begin(9600);
}

void loop() {
  sendBinary(HEADER);
  Serial.print("My message!");
  sendBinary(FOOTER);
  delay(1000);
}

// function to send the given integer value to the serial port
void sendBinary(unsigned int value) {
  //Serial.print("Entire word: ");
  //Serial.println(value, HEX);
  // send the two bytes that comprise a two byte (16 bit) integer
  Serial.write(lowByte(value));   // send the low byte
  //Serial.print("Low byte: ");
  //Serial.println(lowByte(value), HEX);
  Serial.write(highByte(value));  // send the high byte
  //Serial.print("High byte: ");
  //Serial.println(highByte(value), HEX);
}

// function to send the given long integer value to the serial port
void sendBinary(unsigned long value) {
  // first send the low 16 bit integer value
  unsigned int temp = value & 0xFFFF;  // get the value of the lower 16 bits
  sendBinary(temp);
  //Serial.print("Lower: ");
  //Serial.println(temp, HEX);
  // then send the higher 16 bit integer value:
  temp = value >> 16;  // get the value of the higher 16 bits
  sendBinary(temp);
  //Serial.print("Upper: "); 
  //Serial.println(temp, HEX);
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