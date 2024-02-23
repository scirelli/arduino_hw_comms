
```
screen /dev/ttyACM1 9600
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
