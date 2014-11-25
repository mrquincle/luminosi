/*
 * Node server for BLE to connect with the Lumini lightbulbs.
 *
 * Author: Anne van Rossum
 * Date: Sep 30, 2014
 * License: LGPLv3+, MIT, or Apache (your choice)
 * Copyrights: Distributed Organisms B.V. (http://www.dobots.nl)
 */

var noble = require('noble')
, async = require('async')
, Log = require('log')
, defaultLogLevel = 'info'
, log = new Log(defaultLogLevel);

var lumini = (function() {

	// introduce an API object so we only export functions we add to this object
	var api = {};

	// the key for the manufacturer
	var manufacturer = '4248ac361104a57822544c31303052474222';

	var debug = false;

	var bulbs = [];

	var bulbCharacteristic = {};
	var bulbReadCharacteristic = {};

	// the "encryption" of the Lumen bulb uses two keys
	var add_key = new Uint8Array([0, 244, 229, 214, 163, 178, 163, 178, 193, 244, 229, 214, 163, 178, 193, 244, 229, 214, 163, 178]);
	var xor_key = new Uint8Array([0, 43, 60, 77, 94, 111, 247, 232, 217, 202, 187, 172, 157, 142, 127, 94, 111, 247, 232, 217]);

	// values can be maximum 99
	var color = new Uint8Array([0, 99, 0]);

	// start scanning when the local device is powered on
	noble.on('stateChange', function(state) {
		if (state === 'poweredOn') {
			noble.startScanning();
		} else {
			noble.stopScanning();
		}
	});

	// search the light bulb
	noble.on('discover', function(peripheral) {
		if (peripheral.advertisement.manufacturerData) {
			var foundManufacturer = peripheral.advertisement.manufacturerData.toString('hex');
			if (foundManufacturer == manufacturer) {
				log.info("We found a light bulb @ " + peripheral.uuid);
				noble.stopScanning();
				bulbs.push(peripheral);
				printBulb(0);
			}
		}
	});

	// print stuff
	function printBulb(index) {
		if (bulbs.length < index) {
			log.error("The array with bulbs is not long enough");
			return;
		}
		var bulb = bulbs[index];

		var advertisement = bulb.advertisement;

		var localName = advertisement.localName;
		var txPowerLevel = advertisement.txPowerLevel;
		var manufacturerData = advertisement.manufacturerData;
		var serviceData = advertisement.serviceData;
		var serviceUuids = advertisement.serviceUuids;

		if (localName) {
			log.debug('Local Name        = ' + localName);
		}

		if (txPowerLevel) {
			log.debug('TX Power Level    = ' + txPowerLevel);
		}

		if (manufacturerData) {
			log.debug('Manufacturer Data = ' + manufacturerData.toString('hex'));
		}

		if (serviceData) {
			log.debug('Service Data      = ' + serviceData);
		}

		if (localName) {
			log.debug('Service UUIDs     = ' + serviceUuids);
		}

		explore(bulb);
	}

	// just some experimentation with the characteristics
	function experiment() {
			log.info("Found LED write characteristic");
			log.debug("Login");
			login(bulbCharacteristic, function() {

					log.debug("Check if we successfully logged in...");
					successfulLogin(bulbReadCharacteristic, function() {
							log.debug("Set light bulb");
							setRGBLed(bulbCharacteristic);

							// go on with other stuff, if you want here, or make this into a nice javascript lib
							// in this case we just make a nice 3sec 
							setInterval(function() {
								var r = Math.floor((Math.random() * 99) + 1);
								var g = Math.floor((Math.random() * 99) + 1);
								var b = Math.floor((Math.random() * 99) + 1);
								color[0] = r; color[1] = g; color[2] = b;
								setRGBLed(bulbCharacteristic);
							}, 3000);
					});
			})

	}

	// discover services and characteristics
	function explore(peripheral) {
		log.debug('Explore services and characteristics:');

		peripheral.on('disconnect', function() {
			log.error("Gets disconnected!");
			process.exit(0);
		});

		peripheral.connect(function(error) {

			peripheral.discoverServices(['fff0'], function(error, services) {
				var serviceIndex = 0;

				async.whilst(
					function () {
						return (serviceIndex < services.length);
					},
					function(callback) {
						var service = services[serviceIndex];
						var serviceInfo = service.uuid;

						if (service.name) {
							serviceInfo += ' (' + service.name + ')';
						}

						service.discoverCharacteristics(['fff1', 'fff2'], function(error, characteristics) {
							var characteristicIndex = 0;

							async.whilst(
								function () {
									return (characteristicIndex < characteristics.length);
								},
								function(callback) {
									var characteristic = characteristics[characteristicIndex];
									var characteristicInfo = '  ' + characteristic.uuid;
									var startsWithFFF = characteristic.uuid.lastIndexOf('fff', 0) === 0;
									if (characteristic.name) {
										characteristicInfo += ' (' + characteristic.name + ')';
									}

									if (characteristic.uuid == 'fff1') {
											bulbCharacteristic = characteristic;
									} 
									if (characteristic.uuid == 'fff2') {
											bulbReadCharacteristic = characteristic;
									}


									var retrieveCapabilities = true;
									if (startsWithFFF && retrieveCapabilities) {

											async.series([
												// discover descriptors
												function(callback) {
													characteristic.discoverDescriptors(function(error, descriptors) {
														async.detect(
															descriptors,
															function(descriptor, callback) {
																return callback(descriptor.uuid === '2901');
															},
															function(userDescriptionDescriptor){
																if (userDescriptionDescriptor) {
																	userDescriptionDescriptor.readValue(function(error, data) {
																		if (data) {
																			characteristicInfo += ' (' + data.toString() + ')';
																		}
																		callback();
																	});
																} else {
																	callback();
																}
															}
														);
													});
												},
												function() {
													characteristicIndex++;
													callback();
												}
											]);
										} else {
											characteristicIndex++;
											callback();
										}
									},
									function() {
											if (bulbCharacteristic && bulbReadCharacteristic) {
													experiment();
											}
									},
									function(error) {
										serviceIndex++;
										callback();
									}
								);
							});
					},
					function (err) {
						log.error("Some error, disconnect: " + err);
						peripheral.disconnect();
					}
				);
			});
		});
	}

	// login uses a password of a sequence of 12 5's in hex
	// the opcode for logging in is 0x08
	function login(characteristic, callback) {
			var cmd = new Buffer([0x0, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x0]);
			var data = createCommand(cmd);
			print(data);
			var encrypted = encrypt(data);
			encrypted[0] = 0x08; 
			print(encrypted);
			characteristic.write(encrypted, false, function(error) {
					if (error) {
						log.error("Error: " + error);
					} else {
						log.debug('Successfully written value');
						callback();
					}
			});
	}

	// the opcode for setting an RGB is 0x01
	function setRGBLed(characteristic) {
			var cmd = new Buffer([0x0, 0x99, 0x99, 0x99]);
			for (var i = 0; i < 3; i++) {
					cmd[i+1] = color[i];
			}
			log.info("Set led to color " + color[0] + ' ' + color[1] + ' ' + color[2]);
			var data = createCommand(cmd);
			print(data);
			var encrypted = encrypt(data);
			encrypted[0] = 0x01;
			print(encrypted);
			characteristic.write(encrypted);
	}

	// the bulb responds with success / failure 
	function successfulLogin(characteristic, callback) {
			characteristic.read(function(error, data) {
					if (data) {
							log.debug("There is data. We don't check if it is correct yet (should be 08 01).");
							var string = data.toString('ascii');
							var buf = new Uint8Array(20);
							for (var i=0; i<string.length; i++) {
									buf[i] = string.charCodeAt(i);
							}
							var msg = decrypt(buf);
							print(msg);
							log.info("Turn on RGB");
							callback();
					} else {
							log.error("There is no data");
					}
			});

			characteristic.notify(true, function(error) {
					log.debug("Notification, not used.");
			});
	}

	// now we send a command
	function createCommand(buffer) {
			var data = new Buffer(20);
			for (var i = 0; i < data.length; i++) {
				if (i < buffer.length) {
					data[i] = buffer[i];
				} else {
					data[i] = 0;
				}
			}
			return data;
	}

	function clear(array) {
		for (var i = 0; i < array.length; i++) {
			array[i] = 0;
		}
	}

	function add(array, key) { 
			var i = 0;
			var j = array.length - 1;
			while(j >= 0) 
			{ 
					var k = i + ((0xff & array[j]) + (0xff & key[j]));
					if(k >= 256)
					{ 
							i = k >> 8; 
							k -= 256; 
					} else
					{ 
							i = 0;
					} 
					array[j] = k; 
					j--;
			} 
	} 

	function subtract(array, key) {
			var abyte1 = new Uint8Array(array);
			var abyte2 = new Uint8Array(key);
			var byte0 = abyte1[0]; 
			var byte1 = abyte2[0]; 
			var c = 0;
			if(byte0 < byte1) 
					c = 0xff + 1; 
			for(var i = 0; i < abyte1.length - 1; i++) 
			{ 
					var j = 0xff & abyte1[i + 1]; 
					var k = 0xff & abyte2[i + 1]; 
					var c1 = '\0'; 
					if(j < k) 
					{ 
							abyte1[i] = (-1 + abyte1[i]); 
							c1 = 0xff + 1;
					} 
					array[i] = ((c + (0xff & abyte1[i])) - (0xff & abyte2[i])); 
					c = c1; 
			} 

			array[i] = ((c + (0xff & abyte1[i])) - (0xff & abyte2[i])); 
	} 

	function xor(array, key) {
		for (var i = 0; i < array.length; i++) {
			array[i] = array[i] ^ key[i];
		}
	}

	function encrypt(array) {
			add(array, add_key);
			xor(array, xor_key);
			return array;
	}

	function decrypt(array) {
			xor(array, xor_key);
			subtract(array, add_key);
			return array;
	}

	function print(array) {
		if (defaultLogLevel !== 'debug') return;
		if (!array) return;
		var str = '';
		for(var i = 0; i < array.length; i++) {
			str = str + ('0' + array[i].toString(16)).slice(-2);
			if (i != array.length-1) str += '';
		}
		str = str + '';
		console.log(str);
	}

	function testBitManips() {
		console.log("Keys");
		print(add_key);
		print(xor_key);
		console.log("Command");
		var cmd = new Uint8Array([0, 12]);
		var array = createCommand(cmd);
		print(array);
		add(array, add_key);
		print(array);
		xor(array, xor_key);
		console.log("Encoded");
		print(array);
		xor(array, xor_key);
		print(array);
		subtract(array, add_key);
		print(array);
		console.log("Decoded");
	}

	function useMessage() {
		console.log("Make sure you have disconnected from the bulb in your Android/iOS app!");
		console.log("Run through: sudo NOBLE_HCI_DEVICE_ID=X node web.js");
	}

	//testBitManips();

	useMessage();

	return api;
}());

// Will start the server
var server = lumini;

