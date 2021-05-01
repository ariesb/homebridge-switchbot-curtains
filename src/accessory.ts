import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service
} from "homebridge";
import { clearTimeout } from "timers";

const Switchbot = require('node-switchbot');
let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("homebridge-switchbot-curtains", "SwitchbotCurtainsAlternative", SwitchbotCurtainsAlternative);
};

class WoCurtainDevice {
  private config: AccessoryConfig;
  private log: Logging;
  private device: any = null;
  private position: number = 0;
  private targetPosition: number = 0;
  private state: any = hap.Characteristic.PositionState.STOPPED;
  private busy: boolean = false;
  private changePosFn: Function = () => { };
  private changeStateFn: Function = () => { };

  constructor(config: AccessoryConfig, log: Logging) {
    this.config = config;
    this.log = log;

    this.connect();
  }

  getState() {
    return this.state;
  }

  getCurrentPosition() {
    return this.position;
  }

  getTargetPosition() {
    return this.targetPosition;
  }

  setTargetPosition(target: number) {
    if (target === this.targetPosition) return;

    if (!this.busy) {
      this.busy = true;
      this.targetPosition = target;
      this.state = (this.targetPosition < target) ? hap.Characteristic.PositionState.DECREASING : hap.Characteristic.PositionState.INCREASING;
      this.changeStateFn(this.state);

      this.device.runToPos(this.targetPosition);
      this.monitorCurtainMovement();
    }
  }

  async monitorCurtainMovement() {
    this.log.info("WoCurtain Position Monitor Start.");
    let switchbot = new Switchbot();
    await switchbot.startScan();
    switchbot.onadvertisement = (ad: any) => {
      if (ad.address === this.config.ble) {
        if (this.position !== ad.serviceData.position) {
          this.position = ad.serviceData.position;
          this.changePosFn(this.position);
        }

        if (ad.serviceData.position === this.targetPosition) {
          switchbot.stopScan();
          this.log.info("WoCurtain Position Monitor Completed.");

          this.state = hap.Characteristic.PositionState.STOPPED;
          this.changeStateFn(this.state);
        }
      }
    };
    await switchbot.wait(10000);
  }

  onChangePosition(callback: Function) {
    this.changePosFn = callback;
  }

  onChangeState(callback: Function) {
    this.changeStateFn = callback;
  }

  connect() {
    let switchbot = new Switchbot();
    switchbot
      .discover({ model: 'c', quick: false })
      .then((devices: any) => {
        for (let device of devices) {
          this.log.info('WoDevice Found: ', device.modelName, device.address);
          if (device.address == this.config.ble) {
            this.device = device;
            break;
          }
        }
      }).catch((error: any) => {
        console.error(error);
      });
  }
}
class SwitchbotCurtainsAlternative implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly config: AccessoryConfig;

  private readonly curtainService: Service;
  private readonly informationService: Service;

  private device: WoCurtainDevice;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.config = config;

    this.device = new WoCurtainDevice(config, log);
    this.device.onChangePosition(() => {

    });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Name, this.config.name)
      .setCharacteristic(hap.Characteristic.Manufacturer, "Switchbot")
      .setCharacteristic(hap.Characteristic.Model, 'Switchbot WoCurtain')
      .setCharacteristic(hap.Characteristic.SerialNumber, this.config.ble)
      .setCharacteristic(hap.Characteristic.FirmwareRevision, "1.0");

    this.curtainService = new hap.Service.WindowCovering(this.config.name);
    this.curtainService
      .getCharacteristic(hap.Characteristic.CurrentPosition)
      .on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this));

    this.curtainService
      .getCharacteristic(hap.Characteristic.PositionState)
      .on(CharacteristicEventTypes.GET, this.getPositionState.bind(this));

    this.curtainService
      .getCharacteristic(hap.Characteristic.TargetPosition)
      .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this))
      .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

    log.info("Switchbot Curtain finished initializing!");
  }

  identify(): void {
    this.log("Identify!");
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.curtainService
    ];
  }

  getCurrentPosition(callback: CharacteristicGetCallback) {
    this.log.info('Switchbot Current Position', 100 - this.device.getCurrentPosition(), this.device.getCurrentPosition());
    return callback(null, 100 - this.device.getCurrentPosition());
  }

  getPositionState(callback: CharacteristicGetCallback) {
    this.log.info('Switchbot Position State', this.device.getState());
    return callback(null, this.device.getState());
  }

  getTargetPosition(callback: CharacteristicGetCallback) {
    this.log.info('Switchbot Target Position', 100 - this.device.getTargetPosition(), this.device.getTargetPosition());
    return callback(null, 100 - this.device.getTargetPosition());
  }

  setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    let deviceTargetPosition = 100 - parseInt(value.toString());
    this.log.info('Switchbot Setting Target Position', value, deviceTargetPosition);

    this.device.setTargetPosition(deviceTargetPosition);
    callback();
  }
}
