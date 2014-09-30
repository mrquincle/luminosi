# Tabü, and from the Lümen family: Lümini

This devices use Bluetooth Low Energy.

The device is "protected" by a password and every command that is send to the bulb is obfuscated by an addition and xor
 operation. You can look for yourself in the code if this is too vague.

# Installation

Fork my repository, clone it locally, change dirs and use the node package manager:
   
    npm install

There is a script in the `scripts` directory to run it, but it is basically:

    sudo NOBLE_HCI_DEVICE_ID=1 node web.js
   
Check with `hciconfig` which Bluetooth Interface you have to use (`hci0` which is default or `hci1`). To select `hci1` 
you have to have the `NOBLE_HCI_DEVICE_ID=1` environmental variable as indicated.

# More information

If you want more information on how I obtained the above passwords, etc., feel free to contact me.

# Copyrights

* Author: Anne van Rossum
* Date: Sep. 30, 2014
* License: LGPLv3+ or MIT or Apache, whatever you want to use
* Copyrights: Distributed Organisms B.V. (http://dobots.nl)
