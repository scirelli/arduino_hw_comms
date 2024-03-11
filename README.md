
```
screen /dev/ttyACM1 9600
```
Kill the screen session with
```
Ctrl+a k
```

```
screen -ls
screen -X -S <name> kill
```

Example of writing to a tty:
```
echo -ne "\x02${1}\x03" > /dev/ttyUSB0;
```
Example of reading from tty
```
#!/usr/bin/env bash
# read lines one by one until "" (empty line)

file=${1:-'/dev/ttyACM1'}

terminator="$"
while IFS= read -rn4 char; do
    if [ "$char" = "$terminator" ]; then
        #break
        echo ""
    else
        printf "%X" "\"$char"
    fi
done <"$file"
```
One way to view in hex. This will get mangled based on when in the stream you started it.
```
cat /dev/ttyACM1 | hexdump
```


```
FQBN: arduino:avr:uno
Using board 'uno' from platform in folder: ~/.arduino15/packages/arduino/hardware/avr/1.8.6
Using core 'arduino' from platform in folder: ~/.arduino15/packages/arduino/hardware/avr/1.8.6

Detecting libraries used...
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-g++ -c -g -Os -w -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -flto -w -x c++ -E -CC -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10607 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/cores/arduino -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/variants/standard ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/sketch/ham_hw_comms.ino.cpp -o /dev/null
Generating function prototypes...
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-g++ -c -g -Os -w -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -flto -w -x c++ -E -CC -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10607 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/cores/arduino -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/variants/standard ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/sketch/ham_hw_comms.ino.cpp -o ~/.var/app/cc.arduino.IDE2/cache/969730172/sketch_merged.cpp
~/.arduino15/packages/builtin/tools/ctags/5.8-arduino11/ctags -u --language-force=c++ -f - --c++-kinds=svpf --fields=KSTtzns --line-directives ~/.var/app/cc.arduino.IDE2/cache/969730172/sketch_merged.cpp
Compiling sketch...
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-g++ -c -g -Os -w -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10607 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/cores/arduino -I~/.arduino15/packages/arduino/hardware/avr/1.8.6/variants/standard ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/sketch/ham_hw_comms.ino.cpp -o ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/sketch/ham_hw_comms.ino.cpp.o
Compiling libraries...
Compiling core...
Using precompiled core: ~/.var/app/cc.arduino.IDE2/cache/arduino/cores/arduino_avr_uno_ddc00e63aee25adc8cc576b971c2b5a7/core.a
Linking everything together...
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-gcc -w -Os -g -flto -fuse-linker-plugin -Wl,--gc-sections -mmcu=atmega328p -o ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.elf ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/sketch/ham_hw_comms.ino.cpp.o ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/../../cores/arduino_avr_uno_ddc00e63aee25adc8cc576b971c2b5a7/core.a -L~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097 -lm
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-objcopy -O ihex -j .eeprom --set-section-flags=.eeprom=alloc,load --no-change-warnings --change-section-lma .eeprom=0 ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.elf ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.eep
~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-objcopy -O ihex -R .eeprom ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.elf ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.hex

~/.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin/avr-size -A ~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.elf
Sketch uses 1674 bytes (5%) of program storage space. Maximum is 32256 bytes.
Global variables use 196 bytes (9%) of dynamic memory, leaving 1852 bytes for local variables. Maximum is 2048 bytes.
"~/.arduino15/packages/arduino/tools/avrdude/6.3.0-arduino17/bin/avrdude" "-C~/.arduino15/packages/arduino/tools/avrdude/6.3.0-arduino17/etc/avrdude.conf" -v -V -patmega328p -carduino "-P/dev/ttyACM1" -b115200 -D "-Uflash:w:~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.hex:i"

avrdude: Version 6.3-20190619
         Copyright (c) 2000-2005 Brian Dean, http://www.bdmicro.com/
         Copyright (c) 2007-2014 Joerg Wunsch

         System wide configuration file is "~/.arduino15/packages/arduino/tools/avrdude/6.3.0-arduino17/etc/avrdude.conf"
         User configuration file is "~/.avrduderc"
         User configuration file does not exist or is not a regular file, skipping

         Using Port                    : /dev/ttyACM1
         Using Programmer              : arduino
         Overriding Baud Rate          : 115200
         AVR Part                      : ATmega328P
         Chip Erase delay              : 9000 us
         PAGEL                         : PD7
         BS2                           : PC2
         RESET disposition             : dedicated
         RETRY pulse                   : SCK
         serial program mode           : yes
         parallel program mode         : yes
         Timeout                       : 200
         StabDelay                     : 100
         CmdexeDelay                   : 25
         SyncLoops                     : 32
         ByteDelay                     : 0
         PollIndex                     : 3
         PollValue                     : 0x53
         Memory Detail                 :

                                  Block Poll               Page                       Polled
           Memory Type Mode Delay Size  Indx Paged  Size   Size #Pages MinW  MaxW   ReadBack
           ----------- ---- ----- ----- ---- ------ ------ ---- ------ ----- ----- ---------
           eeprom        65    20     4    0 no       1024    4      0  3600  3600 0xff 0xff
           flash         65     6   128    0 yes     32768  128    256  4500  4500 0xff 0xff
           lfuse          0     0     0    0 no          1    0      0  4500  4500 0x00 0x00
           hfuse          0     0     0    0 no          1    0      0  4500  4500 0x00 0x00
           efuse          0     0     0    0 no          1    0      0  4500  4500 0x00 0x00
           lock           0     0     0    0 no          1    0      0  4500  4500 0x00 0x00
           calibration    0     0     0    0 no          1    0      0     0     0 0x00 0x00
           signature      0     0     0    0 no          3    0      0     0     0 0x00 0x00

         Programmer Type : Arduino
         Description     : Arduino
         Hardware Version: 3
         Firmware Version: 4.4
         Vtarget         : 0.3 V
         Varef           : 0.3 V
         Oscillator      : 28.800 kHz
         SCK period      : 3.3 us

avrdude: AVR device initialized and ready to accept instructions

Reading | ################################################## | 100% 0.00s

avrdude: Device signature = 0x1e950f (probably m328p)
avrdude: reading input file "~/.var/app/cc.arduino.IDE2/cache/arduino/sketches/E99BF034B1470AE9053B3E11F8A9A097/ham_hw_comms.ino.hex"
avrdude: writing flash (1674 bytes):

Writing | ################################################## | 100% 0.29s

avrdude: 1674 bytes of flash written

avrdude done.  Thank you.
```
