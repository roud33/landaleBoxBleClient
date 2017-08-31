
//---------------------------------------------------------------------
// NODE SETUP
//---------------------------------------------------------------------

var Bleacon = require('bleacon');

var moment = require('moment')
var _ = require('underscore')
var mqtt = require('mqtt')

var serialport = require('serialport');

var port = new serialport('/dev/ttyO1', {
  baudrate: 9600,
  parser: serialport.parsers.readline('\r\n')
});

var GPS = require('gps');
var gps = new GPS;


//---------------------------------------------------------------------
// UPDATE GPS DATA
//---------------------------------------------------------------------

var RTCReady = true;
var MQTTGPSMessage = [];
var gpsTime = 'null'
var lat = 'null'
var lng = 'null'

/*

(!!!!) Le début du programme commence uniquement quand le RTC du GPS a été mis à jour.
Le postulat est que le temps est correct quand au moins deux satellites sont associés.
A ce moment le flag RTCReady est en mode true et le reste du programme peut commencer.
 
*/

gps.on('data', function (data) {
  //console.log(data);

  /*
  INIT == GPS timestamp >>> RTC timestamp
  */

  if (data.type == 'GSV') {
    //console.log(data)
    //console.log((data.satellites).length)
    if ((data.satellites).length > 1 && RTCReady == false) {
      RTCReady = true
      console.log("RTC is ready. Starting acquisition")
    }
  }

  if (data.type == 'RMC' && RTCReady == true) {
    //console.log(data)
    gpsTime = String(moment(Date.parse(data.time), 'x').format())
    //console.log(gpsTime)

    if (data.lat !== null && data.lon !== null) {

      //console.log("Acquiring GPS position from RMC message")

      MQTTGPSMessage.push({ gpsTime: gpsTime, lat: data.lat, lng: data.lon })

    }

  }

});

port.on('data', function (data) {
  gps.update(data);
});




//---------------------------------------------------------------------
// UPDATE STICKER OBJECT
//---------------------------------------------------------------------

var targetMessagesNbr = 0;
var targetDuration = 2000;
var MQTTStickerMessage = [];
var sitckerInterval = 4000;




//console.log("test")

var stickers =
  [
    { id: "1", uuid: "d0d3fa86ca7645ec9bd96af4f7e68036" , id: "f7e68036389dfca6", type: "shoes", receivedMessages: 0, begin: "", end: "", duration: 0 },
    { id: "2", uuid: "d0d3fa86ca7645ec9bd96af47c040c32" , id: "7c040c329d1c6390", type: "door", receivedMessages: 0, begin: "", end: "", duration: 0 },
    { id: "3", uuid: "d0d3fa86ca7645ec9bd96af45f05d0b4" , id: "5f05d0b42fcd88ca", type: "bag", receivedMessages: 0, begin: "", end: "", duration: 0 },
    { id: "4", uuid : "d0d3fa86ca7645ec9bd96af46c3229e7", id: "6c3229e76c391f79", type: "bed", receivedMessages: 0, begin: "", end: "", duration: 0 },
    { id: "5", uuid : "b9407f30f5f8466eaff925556b57fe7d", id: "", type: "blueberry", receivedMessages: 0, begin: "", end: "", duration: 0 },
    { id: "6", uuid : "b9407f30f5f8466eaff925556b570080", id: "", type: "green", receivedMessages: 0, begin: "", end: "", duration: 0 }
  ]



/* 
 
Nous voulons créer les évenemnts d'associations entre le BB & les beacons.
Une association est validée pendant une durée x si le nombre de message que le BB a reçu du beacon - targetMessagesNbr -est "suffisant"
Si une association est validée on incrémente la durée de x sur le beacon 
Une fois l'association finir, si celle ci a une durée suffisante - targetDuration - la durée totale d'association est enregistrée et envoyée sur le topic MQTT
 
*/



setInterval(function () {

  if (RTCReady == true) {

    console.log(stickers)

    _.map(stickers, function (el) {

      if (el.begin == "") {
        el.begin = gpsTime
      }

      if (el.receivedMessages > 0) {
        el.duration = el.duration + sitckerInterval
      }
      if (el.receivedMessages == 0) {
        if (el.duration > targetDuration) {

          MQTTStickerMessage.push({ beacon: el.type, event: "presence", begin: el.begin, end: String(moment(gpsTime).subtract(sitckerInterval / 1000, 'seconds').format()), duration: el.duration })

        }

        el.duration = 0
        el.begin = gpsTime
      }


      el.receivedMessages = 0
    })

  }

  



}, sitckerInterval);


//---------------------------------------------------------------------
// UPDATE OF BEACON DETECTION
//---------------------------------------------------------------------


Bleacon.on('discover', function (estimoteSticker) {
  //console.log(estimoteSticker);

  //console.log("packet at " + String(moment().format('MMMM Do YYYY, h:mm:ss a')) + " for ID: " + String(estimoteSticker.id) + "acc :" + String(estimoteSticker.acceleration.z))

  //console.log(_.filter(stickers, function (el) { return el.uiid == estimoteSticker.id })[0])

  var object = (_.filter(stickers, function (el) { return el.uuid == estimoteSticker.uuid })[0])

  if (object !== undefined) {

    var receivedMessages = object.receivedMessages + 1;

    _.map(stickers, function (el) {
      if (el.uuid == estimoteSticker.uuid) {
        el.receivedMessages = receivedMessages
      }
    })
  }



});

Bleacon.startScanning();






//---------------------------------------------------------------------
// TRANSFER PROCESS VIA MQTT OF STICKER OBJECT
//---------------------------------------------------------------------


var client = mqtt.connect({ host: 'localhost', port: 1883 })

client.on('connect', function () {
  //client.subscribe("bb1/fuel")

  setInterval(function () {

    if (MQTTGPSMessage.length > 0) {

      client.publish("alpha2/gps", JSON.stringify(_.last(MQTTGPSMessage)), { retain: true });
      //console.log(JSON.stringify(_.last(MQTTGPSMessage)))
      MQTTGPSMessage = []
    }



    if (MQTTStickerMessage.length > 0) {

      _.map(MQTTStickerMessage, function (el) {

        client.publish("alpha2/ble", JSON.stringify(el), { retain: true });
        //console.log(el)

      })

      MQTTStickerMessage = []

    }

  }, 5000);




})