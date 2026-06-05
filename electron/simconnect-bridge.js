/* =====================================================================
   AIVA · SimConnect bridge

   Goal: eliminate the FSUIPC WebSockets Server dependency. Talk to MSFS
   directly through Microsoft's SimConnect SDK, which is built into the
   sim — pilots don't install anything beyond AIVA itself.

   Architecture:
     • Runs in Electron's main process (Node.js — needed for the
       node-simconnect package which talks to MSFS over a Windows
       named pipe).
     • Polls every 5 s for the sim to be available. When SimConnect
       opens, we register a data definition for the variables AIVA
       cares about (position, altitude, speeds, fuel, etc.) and ask
       for them on the SIM_FRAME period.
     • Each frame we emit a 'telemetry' event with a flat JS object,
       same shape as the WebSocket FSUIPC bridge used to produce.
     • State transitions emit a 'state' event (searching | connected).
       main.js forwards both to the renderer over IPC.
     • Auto-reconnects on close/quit — handles the "pilot quits the
       sim then comes back" case without restarting AIVA.

   Windows-only. On macOS / Linux we don't even try (node-simconnect
   throws immediately because the named pipe doesn't exist), so the
   bridge just stays in 'unavailable' state and the existing
   WebSocket-FSUIPC code paths are used as a fallback.
   ===================================================================== */

const { EventEmitter } = require('events');

/* The set of SimVars we subscribe to. Order matters — readers in the
   simObjectData handler decode in the same order. Extended in May
   2026 to support the phase-detection state machine (parking brake,
   flaps, throttle, true airspeed, pushback state). */
/* Deep telemetry set. Each frame the renderer receives every one of
   these, so the Sim Bridge page can show a granular event log:
   "ENG 1 START · NAV LIGHTS ON · FLAPS 1 · GEAR UP · AP ENGAGED · ..."
   The phase machine + auto-dispatch already rely on the original 8;
   the new fields drive the event-log + finer-grained phase detection
   (autopilot disengage at landing, etc.). */
const VARS = [
  /* Position / motion */
  ['PLANE LATITUDE',                          'degrees',         'lat'],
  ['PLANE LONGITUDE',                         'degrees',         'lon'],
  ['PLANE ALTITUDE',                          'feet',            'alt'],
  ['PLANE ALT ABOVE GROUND',                  'feet',            'agl'],
  ['AIRSPEED INDICATED',                      'knots',           'ias'],
  ['AIRSPEED TRUE',                           'knots',           'tas'],
  ['GROUND VELOCITY',                         'knots',           'gs'],
  ['VERTICAL SPEED',                          'feet per minute', 'vs'],
  ['PLANE HEADING DEGREES MAGNETIC',          'degrees',         'hdg'],
  ['MAGVAR',                                  'degrees',         'magvar'],

  /* Ground state */
  ['SIM ON GROUND',                           'bool',            'onGround',     'int32'],
  /* Two parking brake SimVars: 'POSITION' returns float 0-1 (some
     payware uses this for the animation arc), 'INDICATOR' returns
     a clean boolean. We expose both and the renderer prefers whichever
     reports as set. */
  ['BRAKE PARKING POSITION',                  'bool',            'parkingBrake', 'int32'],
  ['BRAKE PARKING INDICATOR',                 'bool',            'parkingBrakeInd', 'int32'],
  ['PUSHBACK STATE',                          'number',          'pushback',     'int32'],
  /* G-force for landing rate measurement. Y axis = vertical. */
  ['G FORCE',                                 'gforce',          'gForce'],

  /* Flight controls + surfaces */
  ['FLAPS HANDLE INDEX',                      'number',          'flapsIdx',     'int32'],
  ['FLAPS HANDLE PERCENT',                    'percent',         'flapsPct'],
  ['SPOILERS HANDLE POSITION',                'percent',         'spoilers'],
  ['SPOILERS ARMED',                          'bool',            'spoilersArmed','int32'],
  ['GEAR HANDLE POSITION',                    'bool',            'gearHandle',   'int32'],
  ['GEAR TOTAL PCT EXTENDED',                 'percent',         'gearPct'],

  /* Engines */
  ['ENG COMBUSTION:1',                        'bool',            'eng1',         'int32'],
  ['ENG COMBUSTION:2',                        'bool',            'eng2',         'int32'],
  ['ENG COMBUSTION:3',                        'bool',            'eng3',         'int32'],
  ['ENG COMBUSTION:4',                        'bool',            'eng4',         'int32'],
  ['NUMBER OF ENGINES',                       'number',          'engCount',     'int32'],
  ['GENERAL ENG THROTTLE LEVER POSITION:1',   'percent',         'throttle1'],
  ['TURB ENG N1:1',                           'percent',         'n1_1'],
  ['TURB ENG N1:2',                           'percent',         'n1_2'],

  /* Autopilot + autothrottle */
  ['AUTOPILOT MASTER',                        'bool',            'apMaster',     'int32'],
  ['AUTOTHROTTLE ACTIVE',                     'bool',            'autoThrottle', 'int32'],
  ['AUTOPILOT ALTITUDE LOCK VAR',             'feet',            'apAlt'],
  ['AUTOPILOT HEADING LOCK DIR',              'degrees',         'apHdg'],

  /* Lights */
  ['LIGHT BEACON',                            'bool',            'lightBeacon',  'int32'],
  ['LIGHT NAV',                               'bool',            'lightNav',     'int32'],
  ['LIGHT STROBE',                            'bool',            'lightStrobe',  'int32'],
  ['LIGHT LANDING',                           'bool',            'lightLanding', 'int32'],
  ['LIGHT TAXI',                              'bool',            'lightTaxi',    'int32'],
  ['LIGHT LOGO',                              'bool',            'lightLogo',    'int32'],

  /* Avionics + transponder */
  ['TRANSPONDER CODE:1',                      'number',          'xpdrCode',     'int32'],
  ['TRANSPONDER STATE:1',                     'number',          'xpdrState',    'int32'],

  /* Fuel / weights */
  ['FUEL TOTAL QUANTITY WEIGHT',              'kilograms',       'fuel'],
  ['TOTAL WEIGHT',                            'kilograms',       'gw'],

  /* Misc */
  ['STALL WARNING',                           'bool',            'stallWarn',    'int32'],
  ['OVERSPEED WARNING',                       'bool',            'overspeedWarn','int32'],
  ['INDICATED ALTITUDE',                      'feet',            'indAlt'],
  ['BAROMETER PRESSURE',                      'inHg',            'baroInHg'],
  ['MACH SPEED',                              'mach',            'mach'],
  ['INCIDENCE ALPHA',                         'degrees',         'aoa'],
  ['PLANE PITCH DEGREES',                     'degrees',         'pitch'],
  ['PLANE BANK DEGREES',                      'degrees',         'bank'],

  /* Engines deeper — per-engine N2, ITT/EGT, fuel flow. The renderer
     only needs to know "is engine alive + healthy"; these let the
     tracker show real EICAS-style numbers. */
  ['TURB ENG N2:1',                           'percent',         'n2_1'],
  ['TURB ENG N2:2',                           'percent',         'n2_2'],
  ['TURB ENG ITT:1',                          'celsius',         'itt_1'],
  ['TURB ENG ITT:2',                          'celsius',         'itt_2'],
  ['ENG FUEL FLOW PPH:1',                     'pounds per hour', 'ff_1'],
  ['ENG FUEL FLOW PPH:2',                     'pounds per hour', 'ff_2'],

  /* Environmental — drives the Tracker page's wind + OAT + ISA dev
     fields, plus the Met card on the dashboard. */
  ['AMBIENT TEMPERATURE',                     'celsius',         'oat'],
  ['AMBIENT WIND VELOCITY',                   'knots',           'windKt'],
  ['AMBIENT WIND DIRECTION',                  'degrees',         'windDir'],

  /* Trim + pressurisation — useful for the post-flight review. */
  ['ELEVATOR TRIM POSITION',                  'degrees',         'elevTrim'],
  ['CABIN ALTITUDE',                          'feet',            'cabinAlt'],
];

const DEF_ID = 0;     // single data definition for all of the above
const REQ_ID = 0;     // single request — runs while we're connected
const RETRY_MS = 5000;
/* Stale-frame watchdog: if we haven't seen a simObjectData callback
   in 15 seconds despite being "connected", treat it as a silent drop
   and tear down + reconnect. Covers the case the user hit at 5 min
   in where the UI still said CONNECTED but no telemetry was flowing. */
const STALE_MS    = 15_000;
const WATCHDOG_MS = 5_000;

class SimBridge extends EventEmitter {
  constructor() {
    super();
    this.handle  = null;
    this.state   = 'unavailable';   // unavailable | searching | connected
    this.last    = null;             // most recent telemetry payload
    this._stopped = false;
    this._lastFrameAt = 0;           // watchdog timestamp
    this._watchdogTimer = null;
    /* Late-required so AIVA still boots on non-Windows machines where
       the module's import chain would otherwise blow up. */
    try {
      this.sc = require('node-simconnect');
      this.state = 'searching';
    } catch (err) {
      console.warn('[AIVA] node-simconnect unavailable:', err.message);
      this.sc = null;
    }
  }

  async start() {
    if (!this.sc) return;
    this._stopped = false;
    this._scheduleConnect(0);
  }

  stop() {
    this._stopped = true;
    if (this._watchdogTimer) { clearInterval(this._watchdogTimer); this._watchdogTimer = null; }
    if (this._retryTimer)    { clearTimeout(this._retryTimer);    this._retryTimer    = null; }
    if (this.handle) {
      try { this.handle.close(); } catch {}
      this.handle = null;
    }
    this.state = 'unavailable';
    this.emit('state', this.state);
  }

  isConnected() { return this.state === 'connected'; }
  getState()    { return this.state; }
  getLast()     { return this.last; }

  _scheduleConnect(delay) {
    if (this._stopped) return;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this._tryConnect(), delay);
  }

  async _tryConnect() {
    if (this._stopped || this.handle) return;
    const { open, Protocol, SimConnectDataType, SimConnectPeriod, SimConnectConstants } = this.sc;
    try {
      /* Protocol.KittyHawk = MSFS 2020 SDK. Falls back automatically
         for MSFS 2024 too (same wire protocol; later versions add
         vars but the open handshake is the same). */
      const { recvOpen, handle } = await open('AIVA Desktop', Protocol.KittyHawk);
      this.handle = handle;
      this.state  = 'connected';
      this.emit('state', this.state);
      console.log(`[AIVA SimConnect] connected to ${recvOpen.applicationName} ${recvOpen.applicationVersionMajor}.${recvOpen.applicationVersionMinor}`);

      /* Register the variables we want. SimConnect's data definition
         API is order-sensitive: we read the resulting bytes in the
         same order they were added. */
      const TYPE_MAP = {
        int32:   SimConnectDataType.INT32,
        float64: SimConnectDataType.FLOAT64,
      };
      VARS.forEach(([name, unit, _key, type]) => {
        handle.addToDataDefinition(
          DEF_ID, name, unit,
          TYPE_MAP[type || 'float64']
        );
      });

      /* SIM_FRAME = fire on every sim render frame (~30-60Hz). We
         throttle below before emitting to the renderer. */
      handle.requestDataOnSimObject(
        REQ_ID, DEF_ID, SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SIM_FRAME
      );

      handle.on('simObjectData', (recv) => {
        if (recv.requestID !== REQ_ID) return;
        const d = recv.data;
        const obj = {};
        for (const [_n, _u, key, type] of VARS) {
          obj[key] = (type === 'int32') ? d.readInt32() : d.readFloat64();
        }
        obj.onGround = !!obj.onGround;
        obj.ts = Date.now();
        this.last = obj;
        this._lastFrameAt = obj.ts;     // for the stale-frame watchdog
        /* Throttle: don't pump 60 Hz over IPC. Cap to ~5 Hz, which is
           plenty for moving maps + bar chart updates. */
        const now = obj.ts;
        if (!this._lastEmit || now - this._lastEmit > 200) {
          this._lastEmit = now;
          this.emit('telemetry', obj);
        }
      });

      handle.on('close', () => this._handleDisconnect('close'));
      handle.on('quit',  () => this._handleDisconnect('quit'));
      handle.on('exception', (ex) => {
        console.warn('[AIVA SimConnect] exception:', ex);
      });

      /* Kick off the stale-frame watchdog. If MSFS goes silent without
         actually closing the named pipe (which we hit at the 5-minute
         mark during the first live test), this catches it and forces
         a reconnect. */
      this._lastFrameAt = Date.now();
      if (this._watchdogTimer) clearInterval(this._watchdogTimer);
      this._watchdogTimer = setInterval(() => {
        if (!this.handle) return;
        const since = Date.now() - this._lastFrameAt;
        if (since > STALE_MS) {
          console.warn(`[AIVA SimConnect] stale — no frame in ${since} ms, recycling`);
          this._handleDisconnect('stale');
        }
      }, WATCHDOG_MS);
    } catch (err) {
      /* Most common reason: MSFS isn't running yet. Quietly retry. */
      this.state = 'searching';
      this.emit('state', this.state);
      this._scheduleConnect(RETRY_MS);
    }
  }

  _handleDisconnect(reason) {
    console.log(`[AIVA SimConnect] disconnected (${reason})`);
    if (this._watchdogTimer) { clearInterval(this._watchdogTimer); this._watchdogTimer = null; }
    if (this.handle) {
      try { this.handle.close(); } catch {}
      this.handle = null;
    }
    this.state = 'searching';
    this.last  = null;
    this.emit('state', this.state);
    /* Faster reconnect on stale (within 2s) so the UI doesn't stay
       wrong for long — full RETRY_MS for clean close/quit. */
    this._scheduleConnect(reason === 'stale' ? 2000 : RETRY_MS);
  }
}

module.exports = SimBridge;
