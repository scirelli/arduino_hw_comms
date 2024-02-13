/*
 * SendBinary sketch
 * Sends a header followed by two random integer values as binary data.
*/

unsigned int intValue;  // an integer value (16 bits)
unsigned long longValue; // an integer value (32 bits)

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.write('H');  // send a header character

  // send a random integer
  //         0b00000000 00000000
  intValue = 0b1000000010000000; //random(599);  // generate a random number between 0 and 599
  // send the two bytes that comprise an integer
  Serial.write(lowByte(intValue));   // send the low byte
  Serial.write(highByte(intValue));  // send the high byte

  delay(1000);
}

// function to send the given integer value to the serial port
void sendBinary(int value) {
  // send the two bytes that comprise a two byte (16 bit) integer
  Serial.write(lowByte(value));   // send the low byte
  Serial.write(highByte(value));  // send the high byte
}

// function to send the given long integer value to the serial port
void sendBinary(long value) {
  // first send the low 16 bit integer value
  int temp = value && 0xFFFF;  // get the value of the lower 16 bits
  sendBinary(temp);
  // then send the higher 16 bit integer value:
  temp = value >> 16;  // get the value of the higher 16 bits
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