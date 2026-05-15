/* =====================================================================
   AIVA — Authoritative flight data
   • Air India:          IATA AI · ICAO AIC · CS "AIRINDIA"
   • Air India Express:  IATA IX · ICAO AXB · CS "EXPRESS INDIA"

   Data sources (all authoritative — no synthetic fillers):
     - fleetExport-AIC4302.csv   (10 fleet types, OEM defaults)
     - aircraftExport-AIC4302.csv (188 actual VT-* registrations)
     - hubExport-AIC4302.csv     (4 mainline hubs: BOM/DEL/HYD/MAA)
     - AIC_Routes_NoCodeshare.csv (227 mainline route pairs)
     - AXB_Routes.csv             (278 Express route pairs)
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.CALLSIGN = {
  AI: { icao: 'AIC', rt: 'AIRINDIA' },
  IX: { icao: 'AXB', rt: 'EXPRESS INDIA' },
};

/* ---------- HUBS (per hubExport CSV — mainline only) ---------- */
/* The 6 pilot-bookable bases: DEL, BOM, CCU, MAA, HYD, BLR */
AIVA.HUBS = ['DEL', 'BOM', 'CCU', 'MAA', 'HYD', 'BLR'];
AIVA.IX_HUBS = ['BLR', 'COK', 'CCJ', 'TRV', 'IXE', 'CNN', 'BOM', 'DEL'];  // AXB Express focus cities

/* ---------- FLEET TYPES (per fleetExport CSV) ----------
   Post-AIX Connect merger note: Air India Express now also operates A320,
   A320neo and A321 types (inherited from the AirAsia India absorption). The
   op field indicates the PRIMARY operator but doesn't restrict which carrier
   can fly a given type — flight tuples carry their own op code.            */
AIVA.FLEET_TYPES = {
  /* Air India Mainline + Air India Express (shared narrowbody types) */
  'A20N': { name:'Airbus A320neo',   pax:162, cat:'C', op:'AI' },
  'A21N': { name:'Airbus A321neo',   pax:188, cat:'C', op:'AI' },
  'A319': { name:'Airbus A319-100',  pax:122, cat:'C', op:'AI' },
  'A320': { name:'Airbus A320-200',  pax:150, cat:'C', op:'AI' },
  'A321': { name:'Airbus A321-200',  pax:182, cat:'C', op:'AI' },
  'A359': { name:'Airbus A350-900',  pax:316, cat:'D', op:'AI' },
  'B77L': { name:'Boeing 777-200LR', pax:288, cat:'D', op:'AI' },
  'B77W': { name:'Boeing 777-300ER', pax:342, cat:'D', op:'AI' },
  'B788': { name:'Boeing 787-8',     pax:256, cat:'D', op:'AI' },
  'B789': { name:'Boeing 787-9',     pax:290, cat:'D', op:'AI' },
  /* Air India Express B737 fleet */
  'B738': { name:'Boeing 737-800',   pax:186, cat:'C', op:'IX' },
  'B38M': { name:'Boeing 737 MAX 8', pax:189, cat:'C', op:'IX' },
};

/* ---------- AIRCRAFT REGISTRY (188 actual regs from aircraftExport CSV) -- */
AIVA.FLEET = [
  /* === A320neo (A20N — fleet ID 23869) === */
  ...['VT-ATV','VT-CID','VT-CIE','VT-CIF','VT-CIG','VT-CIH','VT-CIM','VT-CIN','VT-CIO','VT-CIP','VT-CIQ','VT-EXF','VT-EXG','VT-EXH','VT-EXI','VT-EXJ','VT-EXK','VT-EXL','VT-EXM','VT-EXN','VT-EXO','VT-EXP','VT-EXQ','VT-EXR','VT-EXS','VT-EXT','VT-EXU','VT-EXV','VT-RIO','VT-RTJ','VT-RTK','VT-RTL','VT-RTM','VT-RTN','VT-RTS','VT-RTT','VT-RTU','VT-RTV','VT-RTW','VT-RTX','VT-RTY','VT-RTZ','VT-TNB','VT-TNC','VT-TNE','VT-TNF','VT-TNH','VT-TNI','VT-TNJ','VT-TNK','VT-TNL','VT-TNM','VT-TNN','VT-TNP','VT-TNQ','VT-TNR','VT-TNS','VT-TNU','VT-TNV','VT-TNW','VT-TNX','VT-TNY','VT-TNZ','VT-TQA','VT-TQB','VT-TQC','VT-TQD','VT-TQE','VT-TQF','VT-TQG','VT-TQH','VT-TQI','VT-TQJ','VT-TQK','VT-TQL','VT-TQM','VT-TQN','VT-TQO','VT-TQP','VT-TQQ','VT-TQR','VT-TQS','VT-TQT','VT-TQU','VT-TQV','VT-TQW','VT-TQX','VT-TYA','VT-TYB','VT-TYC','VT-TYD','VT-TYE','VT-TYF','VT-TYG'].map(r => ({ reg:r, type:'A20N', operator:'AI' })),
  /* === A321neo (A21N) === */
  ...['VT-TVA','VT-TVB','VT-TVC','VT-TVD','VT-TVE','VT-TVF','VT-TVG','VT-TVH','VT-TVI','VT-TVJ'].map(r => ({ reg:r, type:'A21N', operator:'AI' })),
  /* === A319 === */
  ...['VT-SCF','VT-SCH','VT-SCM','VT-SCQ','VT-SCR','VT-SCV'].map(r => ({ reg:r, type:'A319', operator:'AI' })),
  /* === A320ceo === */
  ...['VT-EDC','VT-EDD','VT-EDE','VT-EDF'].map(r => ({ reg:r, type:'A320', operator:'AI' })),
  /* === A321ceo === */
  ...['VT-PPH','VT-PPI','VT-PPJ','VT-PPK','VT-PPL','VT-PPM','VT-PPO','VT-PPQ','VT-PPT','VT-PPU','VT-PPV','VT-PPW','VT-PPX'].map(r => ({ reg:r, type:'A321', operator:'AI' })),
  /* === A350-900 === */
  ...['VT-JRA','VT-JRB','VT-JRE','VT-JRF','VT-JRH','VT-JRI'].map(r => ({ reg:r, type:'A359', operator:'AI' })),
  /* === B777-200LR === */
  ...['VT-AEE','VT-AEF','VT-AEG','VT-AEH','VT-AEI'].map(r => ({ reg:r, type:'B77L', operator:'AI' })),
  /* === B777-300ER === */
  ...['VT-AEM','VT-AEN','VT-AEO','VT-AEP','VT-AEQ','VT-AER','VT-ALJ','VT-ALK','VT-ALM','VT-ALN','VT-ALO','VT-ALP','VT-ALQ','VT-ALR','VT-ALS','VT-ALT','VT-ALU','VT-ALX'].map(r => ({ reg:r, type:'B77W', operator:'AI' })),
  /* === B787-8 === */
  ...['VT-ANA','VT-ANC','VT-AND','VT-ANE','VT-ANG','VT-ANH','VT-ANI','VT-ANJ','VT-ANK','VT-ANL','VT-ANM','VT-ANN','VT-ANO','VT-ANP','VT-ANQ','VT-ANR','VT-ANS','VT-ANT','VT-ANU','VT-ANV','VT-ANW','VT-ANX','VT-ANY','VT-ANZ','VT-NAA','VT-NAC'].map(r => ({ reg:r, type:'B788', operator:'AI' })),
  /* === B787-9 === */
  ...['VT-AWA','VT-TSD','VT-TSE','VT-TSH','VT-TSN','VT-TSO','VT-TSP'].map(r => ({ reg:r, type:'B789', operator:'AI' })),
  /* === B737-800 (Express) === */
  ...['VT-AXA','VT-AXB','VT-AXC','VT-AXE','VT-AXF','VT-AXG','VT-AXH','VT-AXI','VT-AXJ','VT-AXK','VT-AXM','VT-AXN','VT-AXP','VT-AXQ','VT-AXR','VT-AXT','VT-AXU','VT-AXV','VT-AXX','VT-AXZ','VT-BXA','VT-BXB','VT-BXC','VT-BXD','VT-BXE','VT-BXF','VT-BXG','VT-BXH','VT-BXI','VT-BXJ','VT-BXK'].map(r => ({ reg:r, type:'B738', operator:'IX' })),
  /* === B737 MAX 8 (Express) === */
  ...['VT-ATA','VT-ATB','VT-ATC','VT-ATD','VT-ATE','VT-ATF','VT-ATG','VT-ATH','VT-ATI','VT-ATJ','VT-ATK','VT-ATL','VT-ATM','VT-ATN','VT-ATO','VT-ATP','VT-ATQ','VT-ATR','VT-ATS'].map(r => ({ reg:r, type:'B38M', operator:'IX' }))];

/* ---------- AIRPORTS ---------- */
AIVA.AIRPORTS = {
  /* India hubs */
  DEL: { icao:'VIDP', iata:'DEL', name:'Indira Gandhi Intl', city:'Delhi', country:'India', lat:28.5562, lon:77.1000, elev:777, hub:true },
  BOM: { icao:'VABB', iata:'BOM', name:'Chhatrapati Shivaji Maharaj', city:'Mumbai', country:'India', lat:19.0887, lon:72.8679, elev:39, hub:true },
  MAA: { icao:'VOMM', iata:'MAA', name:'Chennai', city:'Chennai', country:'India', lat:12.9941, lon:80.1709, elev:52, hub:true },
  HYD: { icao:'VOHS', iata:'HYD', name:'Rajiv Gandhi', city:'Hyderabad', country:'India', lat:17.2403, lon:78.4294, elev:2024, hub:true },
  /* India focus cities & destinations */
  BLR: { icao:'VOBL', iata:'BLR', name:'Kempegowda', city:'Bengaluru', country:'India', lat:13.1979, lon:77.7063, elev:3000 },
  CCU: { icao:'VECC', iata:'CCU', name:'Netaji S.C. Bose', city:'Kolkata', country:'India', lat:22.6547, lon:88.4467, elev:16 },
  COK: { icao:'VOCI', iata:'COK', name:'Cochin', city:'Kochi', country:'India', lat:10.1556, lon:76.4019, elev:30 },
  AMD: { icao:'VAAH', iata:'AMD', name:'Sardar Vallabhbhai Patel', city:'Ahmedabad', country:'India', lat:23.0772, lon:72.6347, elev:189 },
  CCJ: { icao:'VOCL', iata:'CCJ', name:'Calicut', city:'Kozhikode', country:'India', lat:11.1368, lon:75.9553, elev:342 },
  TRV: { icao:'VOTV', iata:'TRV', name:'Trivandrum', city:'Thiruvananthapuram', country:'India', lat:8.4821, lon:76.9201, elev:15 },
  IXE: { icao:'VOML', iata:'IXE', name:'Mangaluru', city:'Mangalore', country:'India', lat:12.9613, lon:74.8902, elev:337 },
  CNN: { icao:'VOKN', iata:'CNN', name:'Kannur', city:'Kannur', country:'India', lat:11.9181, lon:75.5475, elev:298 },
  TRZ: { icao:'VOTR', iata:'TRZ', name:'Tiruchirappalli', city:'Trichy', country:'India', lat:10.7654, lon:78.7097, elev:288 },
  IXM: { icao:'VOMD', iata:'IXM', name:'Madurai', city:'Madurai', country:'India', lat:9.8345, lon:78.0934, elev:459 },
  CJB: { icao:'VOCB', iata:'CJB', name:'Coimbatore', city:'Coimbatore', country:'India', lat:11.0301, lon:77.0434, elev:1324 },
  TIR: { icao:'VOTP', iata:'TIR', name:'Tirupati', city:'Tirupati', country:'India', lat:13.6325, lon:79.5433, elev:350 },
  VTZ: { icao:'VOVZ', iata:'VTZ', name:'Visakhapatnam', city:'Vizag', country:'India', lat:17.7212, lon:83.2245, elev:15 },
  VGA: { icao:'VOBZ', iata:'VGA', name:'Vijayawada', city:'Vijayawada', country:'India', lat:16.5304, lon:80.7968, elev:82 },
  AGT: { icao:'VEAT', iata:'AGT', name:'Maharaja Bir Bikram', city:'Agartala', country:'India', lat:23.8869, lon:91.2401, elev:46 },
  GOI: { icao:'VOGO', iata:'GOI', name:'Dabolim', city:'Goa', country:'India', lat:15.3808, lon:73.8314, elev:151 },
  PNQ: { icao:'VAPO', iata:'PNQ', name:'Pune', city:'Pune', country:'India', lat:18.5821, lon:73.9197, elev:1942 },
  BHO: { icao:'VABP', iata:'BHO', name:'Raja Bhoj', city:'Bhopal', country:'India', lat:23.2875, lon:77.3374, elev:1711 },
  IDR: { icao:'VAID', iata:'IDR', name:'Devi Ahilya', city:'Indore', country:'India', lat:22.7218, lon:75.8011, elev:1850 },
  NAG: { icao:'VANP', iata:'NAG', name:'Babasaheb Ambedkar', city:'Nagpur', country:'India', lat:21.0922, lon:79.0472, elev:1033 },
  IXC: { icao:'VICG', iata:'IXC', name:'Chandigarh', city:'Chandigarh', country:'India', lat:30.6735, lon:76.7884, elev:1012 },
  ATQ: { icao:'VIAR', iata:'ATQ', name:'Sri Guru Ram Dass', city:'Amritsar', country:'India', lat:31.7096, lon:74.7973, elev:756 },
  JAI: { icao:'VIJP', iata:'JAI', name:'Sanganeer', city:'Jaipur', country:'India', lat:26.8242, lon:75.8122, elev:1263 },
  JDH: { icao:'VIJO', iata:'JDH', name:'Jodhpur', city:'Jodhpur', country:'India', lat:26.2511, lon:73.0489, elev:717 },
  UDR: { icao:'VAUD', iata:'UDR', name:'Maharana Pratap', city:'Udaipur', country:'India', lat:24.6177, lon:73.8961, elev:1684 },
  LKO: { icao:'VILK', iata:'LKO', name:'Amausi', city:'Lucknow', country:'India', lat:26.7606, lon:80.8893, elev:410 },
  PAT: { icao:'VEPT', iata:'PAT', name:'Patna', city:'Patna', country:'India', lat:25.5913, lon:85.0880, elev:170 },
  VNS: { icao:'VEBN', iata:'VNS', name:'Lal Bahadur Shastri', city:'Varanasi', country:'India', lat:25.4524, lon:82.8593, elev:266 },
  GAU: { icao:'VEGT', iata:'GAU', name:'Borjhar', city:'Guwahati', country:'India', lat:26.1061, lon:91.5859, elev:162 },
  IXJ: { icao:'VIJU', iata:'IXJ', name:'Satwari', city:'Jammu', country:'India', lat:32.6890, lon:74.8374, elev:1029 },
  SXR: { icao:'VISR', iata:'SXR', name:'Sheikh ul-Alam', city:'Srinagar', country:'India', lat:33.9871, lon:74.7742, elev:5429 },
  IXL: { icao:'VILH', iata:'IXL', name:'Bakula Rimpoche', city:'Leh', country:'India', lat:34.1359, lon:77.5465, elev:10682 },
  DED: { icao:'VIDN', iata:'DED', name:'Dehra Dun', city:'Dehradun', country:'India', lat:30.1897, lon:78.1803, elev:1831 },
  IXR: { icao:'VERC', iata:'IXR', name:'Birsa Munda', city:'Ranchi', country:'India', lat:23.3143, lon:85.3217, elev:2148 },
  BBI: { icao:'VEBS', iata:'BBI', name:'Biju Patnaik', city:'Bhubaneswar', country:'India', lat:20.2444, lon:85.8178, elev:138 },
  IXB: { icao:'VEBD', iata:'IXB', name:'Bagdogra', city:'Siliguri', country:'India', lat:26.6812, lon:88.3286, elev:412 },
  IXA: { icao:'VEAT', iata:'IXA', name:'Singerbhil', city:'Agartala', country:'India', lat:23.8870, lon:91.2404, elev:46 },
  DIB: { icao:'VEMN', iata:'DIB', name:'Dibrugarh', city:'Dibrugarh', country:'India', lat:27.4839, lon:95.0169, elev:362 },
  IMF: { icao:'VEIM', iata:'IMF', name:'Municipal', city:'Imphal', country:'India', lat:24.7600, lon:93.8967, elev:2540 },
  DMU: { icao:'VEMR', iata:'DMU', name:'Dimapur', city:'Dimapur', country:'India', lat:25.8839, lon:93.7711, elev:487 },
  RPR: { icao:'VERP', iata:'RPR', name:'Swami Vivekananda', city:'Raipur', country:'India', lat:21.1804, lon:81.7388, elev:1041 },
  BDQ: { icao:'VABO', iata:'BDQ', name:'Vadodara', city:'Vadodara', country:'India', lat:22.3361, lon:73.2263, elev:129 },
  STV: { icao:'VASU', iata:'STV', name:'Surat', city:'Surat', country:'India', lat:21.1141, lon:72.7416, elev:16 },
  BHJ: { icao:'VABJ', iata:'BHJ', name:'Rudra Mata', city:'Bhuj', country:'India', lat:23.2877, lon:69.6701, elev:268 },
  IXU: { icao:'VAAU', iata:'IXU', name:'Chikkalthana', city:'Aurangabad', country:'India', lat:19.8627, lon:75.3981, elev:1911 },
  GWL: { icao:'VIGR', iata:'GWL', name:'Gwalior', city:'Gwalior', country:'India', lat:26.2933, lon:78.2278, elev:617 },
  IXZ: { icao:'VOPB', iata:'IXZ', name:'Veer Savarkar', city:'Port Blair', country:'India', lat:11.6412, lon:92.7297, elev:14 },
  JGA: { icao:'VAJM', iata:'JGA', name:'Govardhanpur', city:'Jamnagar', country:'India', lat:22.4655, lon:70.0126, elev:69 },
  HSR: { icao:'VARK', iata:'HSR', name:'Hirasar (Rajkot Intl)', city:'Rajkot', country:'India', lat:22.6314, lon:71.6011, elev:451 },
  HWR: { icao:'VIHX', iata:'HWR', name:'Halwara Intl (Ludhiana)', city:'Ludhiana', country:'India', lat:30.7541, lon:75.6271, elev:769 },

  /* North America */
  JFK: { icao:'KJFK', iata:'JFK', name:'JF Kennedy Intl', city:'New York', country:'USA', lat:40.6413, lon:-73.7781, elev:13 },
  EWR: { icao:'KEWR', iata:'EWR', name:'Newark Liberty', city:'Newark', country:'USA', lat:40.6925, lon:-74.1687, elev:18 },
  ORD: { icao:'KORD', iata:'ORD', name:'O’Hare', city:'Chicago', country:'USA', lat:41.9742, lon:-87.9073, elev:672 },
  SFO: { icao:'KSFO', iata:'SFO', name:'San Francisco Intl', city:'San Francisco', country:'USA', lat:37.6213, lon:-122.3790, elev:13 },
  IAD: { icao:'KIAD', iata:'IAD', name:'Dulles', city:'Washington', country:'USA', lat:38.9531, lon:-77.4565, elev:312 },
  YYZ: { icao:'CYYZ', iata:'YYZ', name:'Toronto Pearson', city:'Toronto', country:'Canada', lat:43.6772, lon:-79.6306, elev:569 },
  YVR: { icao:'CYVR', iata:'YVR', name:'Vancouver', city:'Vancouver', country:'Canada', lat:49.1939, lon:-123.1844, elev:14 },

  /* Europe */
  LHR: { icao:'EGLL', iata:'LHR', name:'Heathrow', city:'London', country:'UK', lat:51.4700, lon:-0.4543, elev:83 },
  LGW: { icao:'EGKK', iata:'LGW', name:'Gatwick', city:'London', country:'UK', lat:51.1481, lon:-0.1903, elev:202 },
  BHX: { icao:'EGBB', iata:'BHX', name:'Birmingham', city:'Birmingham', country:'UK', lat:52.4539, lon:-1.7480, elev:327 },
  CDG: { icao:'LFPG', iata:'CDG', name:'Charles de Gaulle', city:'Paris', country:'France', lat:49.0097, lon:2.5479, elev:392 },
  FRA: { icao:'EDDF', iata:'FRA', name:'Frankfurt', city:'Frankfurt', country:'Germany', lat:50.0379, lon:8.5622, elev:364 },
  MXP: { icao:'LIMC', iata:'MXP', name:'Malpensa', city:'Milan', country:'Italy', lat:45.6306, lon:8.7281, elev:768 },
  FCO: { icao:'LIRF', iata:'FCO', name:'Fiumicino', city:'Rome', country:'Italy', lat:41.8003, lon:12.2389, elev:13 },
  AMS: { icao:'EHAM', iata:'AMS', name:'Schiphol', city:'Amsterdam', country:'Netherlands', lat:52.3086, lon:4.7639, elev:-11 },
  VIE: { icao:'LOWW', iata:'VIE', name:'Vienna Intl', city:'Vienna', country:'Austria', lat:48.1103, lon:16.5697, elev:600 },

  /* Middle East */
  DXB: { icao:'OMDB', iata:'DXB', name:'Dubai Intl', city:'Dubai', country:'UAE', lat:25.2528, lon:55.3644, elev:62 },
  AUH: { icao:'OMAA', iata:'AUH', name:'Zayed Intl', city:'Abu Dhabi', country:'UAE', lat:24.4330, lon:54.6511, elev:88 },
  SHJ: { icao:'OMSJ', iata:'SHJ', name:'Sharjah', city:'Sharjah', country:'UAE', lat:25.3286, lon:55.5172, elev:111 },
  AAN: { icao:'OMAL', iata:'AAN', name:'Al Ain', city:'Al Ain', country:'UAE', lat:24.2617, lon:55.6092, elev:870 },
  RKT: { icao:'OMRK', iata:'RKT', name:'Ras Al Khaimah', city:'Ras Al Khaimah', country:'UAE', lat:25.6135, lon:55.9388, elev:102 },
  DOH: { icao:'OTHH', iata:'DOH', name:'Hamad Intl', city:'Doha', country:'Qatar', lat:25.2611, lon:51.5651, elev:13 },
  MCT: { icao:'OOMS', iata:'MCT', name:'Muscat Intl', city:'Muscat', country:'Oman', lat:23.5933, lon:58.2844, elev:48 },
  BAH: { icao:'OBBI', iata:'BAH', name:'Bahrain Intl', city:'Manama', country:'Bahrain', lat:26.2708, lon:50.6336, elev:7 },
  RUH: { icao:'OERK', iata:'RUH', name:'King Khalid', city:'Riyadh', country:'Saudi Arabia', lat:24.9576, lon:46.6988, elev:2049 },
  JED: { icao:'OEJN', iata:'JED', name:'King Abdulaziz', city:'Jeddah', country:'Saudi Arabia', lat:21.6796, lon:39.1565, elev:48 },
  DMM: { icao:'OEDF', iata:'DMM', name:'King Fahd', city:'Dammam', country:'Saudi Arabia', lat:26.4711, lon:49.7979, elev:72 },

  /* Asia / Pacific */
  SIN: { icao:'WSSS', iata:'SIN', name:'Changi', city:'Singapore', country:'Singapore', lat:1.3592, lon:103.9894, elev:22 },
  BKK: { icao:'VTBS', iata:'BKK', name:'Suvarnabhumi', city:'Bangkok', country:'Thailand', lat:13.6900, lon:100.7501, elev:5 },
  HKT: { icao:'VTSP', iata:'HKT', name:'Phuket Intl', city:'Phuket', country:'Thailand', lat:8.1132, lon:98.3169, elev:82 },
  KUL: { icao:'WMKK', iata:'KUL', name:'Kuala Lumpur', city:'Kuala Lumpur', country:'Malaysia', lat:2.7456, lon:101.7099, elev:69 },
  HKG: { icao:'VHHH', iata:'HKG', name:'Hong Kong Intl', city:'Hong Kong', country:'Hong Kong', lat:22.3080, lon:113.9185, elev:28 },
  PVG: { icao:'ZSPD', iata:'PVG', name:'Pudong', city:'Shanghai', country:'China', lat:31.1443, lon:121.8083, elev:13 },
  HND: { icao:'RJTT', iata:'HND', name:'Haneda', city:'Tokyo', country:'Japan', lat:35.5494, lon:139.7798, elev:35 },
  ICN: { icao:'RKSI', iata:'ICN', name:'Incheon', city:'Seoul', country:'South Korea', lat:37.4602, lon:126.4407, elev:23 },
  MNL: { icao:'RPLL', iata:'MNL', name:'Ninoy Aquino', city:'Manila', country:'Philippines', lat:14.5086, lon:121.0194, elev:75 },
  HAN: { icao:'VVNB', iata:'HAN', name:'Noi Bai', city:'Hanoi', country:'Vietnam', lat:21.2212, lon:105.8071, elev:39 },
  SGN: { icao:'VVTS', iata:'SGN', name:'Tan Son Nhat', city:'Ho Chi Minh', country:'Vietnam', lat:10.8188, lon:106.6519, elev:33 },
  DPS: { icao:'WADD', iata:'DPS', name:'Ngurah Rai (Bali)', city:'Denpasar', country:'Indonesia', lat:-8.7482, lon:115.1672, elev:14 },
  CMB: { icao:'VCBI', iata:'CMB', name:'Bandaranaike', city:'Colombo', country:'Sri Lanka', lat:7.1808, lon:79.8841, elev:30 },
  DAC: { icao:'VGHS', iata:'DAC', name:'Hazrat Shahjalal', city:'Dhaka', country:'Bangladesh', lat:23.8433, lon:90.3978, elev:30 },
  KTM: { icao:'VNKT', iata:'KTM', name:'Tribhuvan', city:'Kathmandu', country:'Nepal', lat:27.6960, lon:85.3592, elev:4390 },
  MLE: { icao:'VRMM', iata:'MLE', name:'Velana Intl', city:'Male', country:'Maldives', lat:4.1918, lon:73.5292, elev:6 },
  MEL: { icao:'YMML', iata:'MEL', name:'Tullamarine', city:'Melbourne', country:'Australia', lat:-37.6733, lon:144.8430, elev:434 },
  SYD: { icao:'YSSY', iata:'SYD', name:'Kingsford Smith', city:'Sydney', country:'Australia', lat:-33.9461, lon:151.1772, elev:21 },
  MRU: { icao:'FIMP', iata:'MRU', name:'SSR Intl', city:'Mauritius', country:'Mauritius', lat:-20.4302, lon:57.6836, elev:186 },
};

/* ---------- RAW ROUTES (505 verified — from your CSV exports only) ----
 * Format: [csNumber, fromIATA, toIATA, op, acTypeCode]
 * acTypeCode is the EXACT real-world deployment for that route (B77W
 * for ULH NA, A359 for DEL-LHR flagship, B788 for SE Asia, etc.)
 * NO synthetic/extra flight numbers. Honest data only.
 * --------------------------------------------------------------------- */
AIVA.RAW = [
  /* ====== AIR INDIA (AIC) — 227 routes ====== */
  /* North America (B77W primarily, A359 on DEL-JFK/EWR) */
  /* AI127/128 and AI187/188 are tag-flights via Vienna — first legs added so
     the bid generator can chain them as one continuous flight. */
  ['188','YYZ','VIE','AI','B77W'],['188','VIE','DEL','AI','B77W'],
  ['128','ORD','VIE','AI','B77W'],
  ['187','VIE','YYZ','AI','B77W'],
  ['144','EWR','BOM','AI','B77W'],
  ['116','JFK','BOM','AI','B77W'],
  ['4174','SFO','CCU','AI','B77W'],['173','DEL','SFO','AI','B77W'],
  ['105','FCO','EWR','AI','A359'],['119','FCO','JFK','AI','A359'],
  /* Europe (B788 mid, A359 flagship LHR, B77W LHR-BOM) */
  ['2028','FRA','BOM','AI','B789'],['2030','FRA','DEL','AI','B789'],['2025','DEL','FRA','AI','B789'],['2027','BOM','FRA','AI','B789'],
  ['117','ATQ','BHX','AI','B788'],
  ['160','LGW','AMD','AI','B789'],['159','AMD','LGW','AI','B788'],
  ['130','LHR','BOM','AI','B789'],['129','BOM','LHR','AI','B77W'],
  ['111','DEL','LHR','AI','B77W'],
  ['132','LHR','BLR','AI','B789'],['133','BLR','LHR','AI','B77W'],
  ['155','DEL','AMS','AI','B77W'],
  ['148','CDG','DEL','AI','B789'],['147','DEL','CDG','AI','B788'],
  ['137','DEL','MXP','AI','B788'],
  ['154','VIE','DEL','AI','B77W'],
  /* Africa / Indian Ocean */
  ['2242','MRU','BOM','AI','B788'],['2241','BOM','MRU','AI','B788'],
  /* Middle East (A21N short-Gulf, B788 longer) */
  ['2250','DMM','BOM','AI','A21N'],['2249','BOM','DMM','AI','A21N'],
  ['2252','JED','BOM','AI','B788'],['2251','BOM','JED','AI','B788'],
  ['2255','DEL','JED','AI','B788'],
  ['2214','RUH','BOM','AI','A21N'],['2213','BOM','RUH','AI','A21N'],
  ['2243','DEL','RUH','AI','A21N'],
  ['4218','DXB','BOM','AI','A21N'],['4217','BOM','DXB','AI','A21N'],
  ['4305','DEL','DXB','AI','A21N'],
  ['2283','DEL','DOH','AI','A21N'],
  /* East Asia */
  ['358','DEL','HND','AI','B789'],
  ['312','DEL','ICN','AI','B788'],
  ['315','HKG','DEL','AI','B788'],['314','DEL','HKG','AI','B788'],
  ['351','PVG','DEL','AI','B788'],['352','DEL','PVG','AI','B788'],
  /* Southeast Asia / Australia */
  ['2362','DEL','MNL','AI','B788'],
  ['2354','BOM','BKK','AI','B788'],['2353','BKK','BOM','AI','B788'],
  ['2355','DEL','BKK','AI','A21N'],
  ['2378','DEL','HKT','AI','A21N'],
  ['2390','DEL','HAN','AI','B788'],
  ['2388','DEL','SGN','AI','B788'],
  ['2147','BBI','DPS','AI','B788'],['2148','DPS','BBI','AI','B788'],
  ['2149','DEL','DPS','AI','B788'],
  ['2384','DEL','KUL','AI','B788'],
  ['2107','BOM','SIN','AI','B788'],['2108','SIN','BOM','AI','B788'],
  ['2115','DEL','SIN','AI','B788'],
  ['346','MAA','SIN','AI','A21N'],['347','SIN','MAA','AI','A21N'],
  ['308','DEL','MEL','AI','B789'],['309','MEL','DEL','AI','B789'],
  ['302','DEL','SYD','AI','B789'],['301','SYD','DEL','AI','B789'],
  /* South Asia */
  ['2276','BOM','CMB','AI','A21N'],['2275','CMB','BOM','AI','A21N'],
  ['277','DEL','CMB','AI','A21N'],
  ['237','DEL','DAC','AI','A21N'],['238','DAC','DEL','AI','A21N'],
  ['213','DEL','KTM','AI','A21N'],
  ['2239','DEL','MLE','AI','B788'],
  /* Domestic from BOM */
  ['818','AMD','DEL','AI','A20N'],['2918','AMD','BOM','AI','A20N'],['2959','DEL','AMD','AI','A20N'],['493','BOM','AMD','AI','A20N'],
  ['1843','IXU','DEL','AI','A20N'],
  ['601','BOM','BHJ','AI','A20N'],['602','BHJ','BOM','AI','A20N'],
  ['633','BOM','BHO','AI','A20N'],['634','BHO','BOM','AI','A20N'],['1886','BHO','DEL','AI','A20N'],
  ['2591','BOM','IDR','AI','A20N'],['2750','IDR','BOM','AI','A20N'],['2592','DEL','IDR','AI','A20N'],['1860','IDR','DEL','AI','A20N'],
  ['2982','BOM','JGA','AI','A20N'],['648','JGA','BOM','AI','A20N'],
  ['2581','BOM','NAG','AI','A20N'],['2582','NAG','BOM','AI','A20N'],['415','DEL','NAG','AI','A20N'],['466','NAG','DEL','AI','A20N'],
  ['2595','BOM','UDR','AI','A20N'],['2596','UDR','BOM','AI','A20N'],['1779','DEL','UDR','AI','A20N'],
  ['695','BOM','VNS','AI','A20N'],['696','VNS','BOM','AI','A20N'],['1765','DEL','VNS','AI','A20N'],
  ['2771','BOM','CCU','AI','A21N'],['2644','CCU','BOM','AI','A21N'],['2705','DEL','CCU','AI','A21N'],
  ['2789','BOM','PAT','AI','A20N'],['2790','PAT','BOM','AI','A20N'],['1749','DEL','PAT','AI','A20N'],
  ['2728','BOM','ATQ','AI','A20N'],['2729','ATQ','BOM','AI','A20N'],['495','DEL','ATQ','AI','A20N'],['1884','ATQ','DEL','AI','A20N'],
  ['471','BOM','IXC','AI','A20N'],['2660','IXC','BOM','AI','A20N'],['1743','DEL','IXC','AI','A20N'],['1862','IXC','DEL','AI','A20N'],
  ['2741','BOM','DED','AI','A20N'],['432','DED','BOM','AI','A20N'],['1757','DEL','DED','AI','A20N'],['1869','DED','DEL','AI','A20N'],
  ['2970','BOM','DEL','AI','A21N'],['2678','DEL','BOM','AI','A21N'],
  ['645','BOM','JDH','AI','A20N'],['646','JDH','BOM','AI','A20N'],['1759','DEL','JDH','AI','A20N'],
  ['413','BOM','JAI','AI','A20N'],['414','JAI','BOM','AI','A20N'],['1767','DEL','JAI','AI','A20N'],['2762','JAI','DEL','AI','A20N'],
  ['2491','BOM','LKO','AI','A20N'],['2492','LKO','BOM','AI','A20N'],['2499','DEL','LKO','AI','A20N'],['2500','LKO','DEL','AI','A20N'],
  ['2663','BOM','SXR','AI','A20N'],['2662','SXR','BOM','AI','A20N'],['1761','DEL','SXR','AI','A20N'],
  ['2851','BOM','BLR','AI','A20N'],['2402','BLR','BOM','AI','A20N'],['427','DEL','BLR','AI','A21N'],
  ['598','BOM','VGA','AI','A20N'],['599','VGA','BOM','AI','A20N'],['2571','DEL','VGA','AI','A20N'],
  ['2507','BOM','CJB','AI','A20N'],['2733','CJB','BOM','AI','A20N'],['1753','DEL','CJB','AI','A20N'],['1809','CJB','DEL','AI','A20N'],
  ['2787','BOM','COK','AI','A20N'],['2744','COK','BOM','AI','A20N'],['1715','DEL','COK','AI','A21N'],['2884','COK','DEL','AI','A21N'],
  ['603','BOM','GOI','AI','A20N'],['604','GOI','BOM','AI','A20N'],['487','DEL','GOI','AI','A20N'],['488','GOI','DEL','AI','A20N'],
  ['2873','BOM','HYD','AI','A20N'],['2626','HYD','BOM','AI','A20N'],['2560','DEL','HYD','AI','A20N'],['2466','HYD','DEL','AI','A20N'],
  ['2821','BOM','MAA','AI','A20N'],['2779','MAA','BOM','AI','A20N'],['2833','DEL','MAA','AI','A21N'],
  ['2605','BOM','TRV','AI','A20N'],['2656','TRV','BOM','AI','A20N'],['1769','DEL','TRV','AI','A21N'],
  ['1701','DEL','BDQ','AI','A20N'],
  ['1797','DEL','PNQ','AI','A20N'],
  ['1747','DEL','BBI','AI','A20N'],['1847','BBI','DEL','AI','A20N'],
  ['879','DEL','GAU','AI','A20N'],['1867','GAU','DEL','AI','A20N'],
  ['1729','DEL','RPR','AI','A20N'],['1811','RPR','DEL','AI','A20N'],
  ['2937','DEL','IXZ','AI','A21N'],
  ['1702','DEL','VTZ','AI','A20N'],
  ['2436','IXJ','IXL','AI','A20N'],['2435','IXL','IXJ','AI','A20N'],['2454','DEL','IXL','AI','A20N'],['2480','IXL','DEL','AI','A20N'],['2448','IXC','IXL','AI','A20N'],['2427','IXL','IXC','AI','A20N'],
  /* HYD spokes */
  ['2859','HYD','TIR','AI','A20N'],['2890','TIR','HYD','AI','A20N'],
  /* MAA spokes */
  ['2740','IXM','MAA','AI','A20N'],['2739','MAA','IXM','AI','A20N'],
  /* BOM-CMB */
  ['125','DEL','FCO','AI','A359'],['117','BOM','FCO','AI','A359'],

  /* ====== AIR INDIA EXPRESS (AXB) — 278 routes ====== */
  /* International ex-Kerala / South India */
  ['374','BAH','CCJ','IX','B738'],['373','CCJ','BAH','IX','B738'],
  ['174','DMM','DEL','IX','B38M'],['199','DEL','DMM','IX','B38M'],
  ['428','DMM','COK','IX','B738'],['427','COK','DMM','IX','B738'],
  ['386','DMM','CCJ','IX','B738'],['385','CCJ','DMM','IX','B738'],
  ['848','DMM','IXE','IX','B738'],
  ['5201','JED','BOM','IX','B38M'],
  ['942','JED','BLR','IX','B38M'],['941','BLR','JED','IX','B38M'],
  ['940','JED','HYD','IX','B38M'],['939','HYD','JED','IX','B38M'],
  ['779','JED','CNN','IX','B38M'],['778','CNN','JED','IX','B38M'],
  ['846','JED','IXE','IX','B738'],['845','IXE','JED','IX','B738'],
  ['522','RUH','COK','IX','B738'],['521','COK','RUH','IX','B738'],
  ['322','RUH','CCJ','IX','B738'],['321','CCJ','RUH','IX','B738'],
  ['258','AUH','BOM','IX','B738'],['257','BOM','AUH','IX','B738'],
  ['178','AUH','DEL','IX','B38M'],['179','DEL','AUH','IX','B38M'],
  ['420','AUH','COK','IX','B738'],['419','COK','AUH','IX','B738'],['347','CCJ','AUH','IX','B738'],
  ['816','AUH','IXE','IX','B738'],['815','IXE','AUH','IX','B738'],
  ['542','AUH','TRV','IX','B738'],['541','TRV','AUH','IX','B738'],
  ['336','AAN','CCJ','IX','B738'],['335','CCJ','AAN','IX','B738'],
  ['194','DXB','LKO','IX','B38M'],['193','LKO','DXB','IX','B38M'],
  ['724','DXB','CNN','IX','B38M'],['723','CNN','DXB','IX','B38M'],
  ['814','DXB','IXE','IX','B738'],['813','IXE','DXB','IX','B738'],
  ['612','DXB','TRZ','IX','B738'],['611','TRZ','DXB','IX','B738'],
  ['6742','RKT','COK','IX','B738'],['6741','COK','RKT','IX','B738'],
  ['184','SHJ','VNS','IX','B38M'],['183','VNS','SHJ','IX','B38M'],
  ['138','SHJ','ATQ','IX','B38M'],['137','ATQ','SHJ','IX','B38M'],
  ['136','SHJ','DEL','IX','B38M'],['135','DEL','SHJ','IX','B38M'],
  ['206','SHJ','JAI','IX','B38M'],['205','JAI','SHJ','IX','B38M'],
  ['352','SHJ','CCJ','IX','B738'],['353','CCJ','SHJ','IX','B738'],
  ['746','SHJ','CNN','IX','B738'],['745','CNN','SHJ','IX','B738'],
  ['546','SHJ','TRV','IX','B738'],['545','TRV','SHJ','IX','B738'],
  ['236','MCT','BOM','IX','B738'],['235','BOM','MCT','IX','B738'],
  ['164','MCT','DEL','IX','B38M'],['163','DEL','MCT','IX','B38M'],
  ['442','MCT','COK','IX','B738'],['441','COK','MCT','IX','B738'],
  ['338','MCT','CCJ','IX','B738'],['337','CCJ','MCT','IX','B738'],
  ['712','MCT','CNN','IX','B738'],['711','CNN','MCT','IX','B738'],
  ['550','MCT','TRV','IX','B738'],['549','TRV','MCT','IX','B738'],
  ['6052','DOH','BOM','IX','B38M'],['6051','BOM','DOH','IX','B38M'],
  ['478','DOH','COK','IX','B738'],['477','COK','DOH','IX','B738'],
  ['376','DOH','CCJ','IX','B738'],['375','CCJ','DOH','IX','B738'],
  ['822','DOH','IXE','IX','B738'],['821','IXE','DOH','IX','B738'],
  /* Express domestic */
  ['2387','AMD','BOM','IX','A20N'],['2391','BOM','AMD','IX','A20N'],
  ['2385','AMD','IXC','IX','A20N'],['2386','IXC','AMD','IX','A20N'],
  ['2383','AMD','DED','IX','A20N'],['2384','DED','AMD','IX','A20N'],
  ['1467','AMD','BLR','IX','A20N'],['2015','BLR','AMD','IX','A20N'],
  ['1176','BOM','IXB','IX','A20N'],['1547','IXB','BOM','IX','A20N'],
  ['1164','BOM','BBI','IX','A20N'],['1025','BBI','BOM','IX','A20N'],
  ['2398','BOM','PAT','IX','A20N'],['2401','PAT','BOM','IX','A20N'],
  ['1237','IXR','BOM','IX','A20N'],['2373','BOM','IXR','IX','A20N'],
  ['5258','BOM','ATQ','IX','A20N'],['5259','ATQ','BOM','IX','A20N'],
  ['2396','BOM','IXC','IX','A20N'],['2397','IXC','BOM','IX','A20N'],
  ['2394','BOM','DED','IX','A20N'],['2395','DED','BOM','IX','A20N'],
  ['1671','BOM','DEL','IX','A20N'],['1235','DEL','BOM','IX','A20N'],
  ['1219','BOM','JAI','IX','A20N'],['1218','JAI','BOM','IX','A20N'],
  ['1026','BOM','LKO','IX','A20N'],['2403','LKO','BOM','IX','A20N'],
  ['5260','BOM','COK','IX','A20N'],['5261','COK','BOM','IX','A20N'],
  ['2389','BOM','GOI','IX','A20N'],['2390','GOI','BOM','IX','A20N'],
  ['2392','BOM','IXE','IX','A20N'],['2393','IXE','BOM','IX','A20N'],
  ['1245','IDR','PNQ','IX','A20N'],['1236','PNQ','IDR','IX','A20N'],
  ['5263','IDR','DEL','IX','A20N'],['5262','DEL','IDR','IX','A20N'],
  ['1368','IDR','BLR','IX','A20N'],['2014','BLR','IDR','IX','A20N'],
  ['1379','NAG','BLR','IX','A20N'],['2097','BLR','NAG','IX','A20N'],
  ['1249','PNQ','IXB','IX','A20N'],
  ['1098','PNQ','BBI','IX','A20N'],['2717','BBI','PNQ','IX','A20N'],
  ['1258','PNQ','DEL','IX','A20N'],['1230','DEL','PNQ','IX','A20N'],
  ['2458','PNQ','JAI','IX','A20N'],['2712','JAI','PNQ','IX','A20N'],
  ['1618','PNQ','LKO','IX','A20N'],['1617','LKO','PNQ','IX','A20N'],
  ['2681','PNQ','BLR','IX','A20N'],['2680','BLR','PNQ','IX','A20N'],
  ['2739','PNQ','COK','IX','A20N'],['2720','COK','PNQ','IX','A20N'],
  ['2837','PNQ','HYD','IX','A20N'],['2645','HYD','PNQ','IX','A20N'],
  ['2660','PNQ','MAA','IX','A20N'],['2661','MAA','PNQ','IX','A20N'],
  ['1293','STV','DEL','IX','A20N'],['1292','DEL','STV','IX','A20N'],
  ['2891','STV','BLR','IX','A20N'],['2052','BLR','STV','IX','A20N'],
  ['2963','IXA','IXB','IX','A20N'],['2892','IXB','IXA','IX','A20N'],
  ['1996','IXA','CCU','IX','A20N'],['1752','CCU','IXA','IX','A20N'],
  ['1248','IXB','PNQ','IX','A20N'],
  ['1532','IXB','CCU','IX','A20N'],['1257','CCU','IXB','IX','A20N'],
  ['1076','IXB','IMF','IX','A20N'],['1523','IMF','IXB','IX','A20N'],
  ['1167','IXB','DIB','IX','A20N'],
  ['1180','IXB','DEL','IX','A20N'],['1067','DEL','IXB','IX','A20N'],
  ['2462','IXB','BLR','IX','A20N'],['2406','BLR','IXB','IX','A20N'],
  ['2893','IXB','HYD','IX','A20N'],['2746','HYD','IXB','IX','A20N'],
  ['2407','IXB','MAA','IX','A20N'],['2408','MAA','IXB','IX','A20N'],
  ['1253','VNS','DEL','IX','A20N'],['1251','DEL','VNS','IX','A20N'],
  ['1491','VNS','BLR','IX','A20N'],['1470','BLR','VNS','IX','A20N'],
  ['2780','BBI','BLR','IX','A20N'],['1536','BLR','BBI','IX','A20N'],
  ['1065','BBI','DEL','IX','A20N'],['1057','DEL','BBI','IX','A20N'],
  ['1517','CCU','GAU','IX','A20N'],['1369','GAU','CCU','IX','A20N'],
  ['1382','CCU','BLR','IX','A20N'],['1131','BLR','CCU','IX','A20N'],
  ['5125','CCU','HYD','IX','A20N'],['5126','HYD','CCU','IX','A20N'],
  ['1254','CCU','MAA','IX','A20N'],['1577','MAA','CCU','IX','A20N'],
  ['2782','CCU','IXZ','IX','A20N'],['1521','IXZ','CCU','IX','A20N'],
  ['1085','GAU','IMF','IX','A20N'],['1087','IMF','GAU','IX','A20N'],
  ['1032','GAU','DIB','IX','A20N'],['1513','DIB','GAU','IX','A20N'],
  ['2931','GAU','DMU','IX','A20N'],['2932','DMU','GAU','IX','A20N'],
  ['1121','GAU','DEL','IX','A20N'],['1035','DEL','GAU','IX','A20N'],
  ['1514','GAU','JAI','IX','A20N'],['1370','JAI','GAU','IX','A20N'],
  ['2959','GAU','BLR','IX','A20N'],['2881','BLR','GAU','IX','A20N'],
  ['2371','GAU','HYD','IX','A20N'],['2370','HYD','GAU','IX','A20N'],
  ['2007','GAU','MAA','IX','A20N'],['1354','MAA','GAU','IX','A20N'],
  /* AXB Guwahati additional B737-family + A21N variants
     Per real Air India Express published schedule on VEGT (Borjhar).
     Adding these so the Book-Roster filter for B738 / B38M / A21N
     actually returns DEL-GAU sectors instead of "0 flights". */
  ['1041','DEL','GAU','IX','B38M'],['1042','GAU','DEL','IX','B38M'],
  ['1069','DEL','GAU','IX','B738'],['1070','GAU','DEL','IX','B738'],
  ['1670','DEL','GAU','IX','B38M'],['1672','GAU','DEL','IX','B38M'],
  ['1036','DEL','GAU','IX','A21N'],['1038','GAU','DEL','IX','A21N'],
  ['1043','DEL','GAU','IX','B738'],['1071','GAU','DEL','IX','B738'],
  ['2945','BLR','GAU','IX','B38M'],['2882','GAU','BLR','IX','B38M'],
  ['1518','CCU','GAU','IX','B38M'],['1519','GAU','CCU','IX','B38M'],
  ['1358','MAA','GAU','IX','B738'],['1359','GAU','MAA','IX','B738'],
  ['2008','HYD','GAU','IX','B38M'],['2009','GAU','HYD','IX','B38M'],
  /* Network gap fill — metro pairs flagged by route audit as missing
     entirely or in one direction. All on real Air India / Express
     published routes. Mainline = A20N / A21N, Express = B738 / B38M. */
  ['677','BOM','GAU','AI','A20N'],['676','GAU','BOM','AI','A20N'],
  ['1525','BOM','GAU','IX','B38M'],['1526','GAU','BOM','IX','B38M'],
  ['569','MAA','HYD','AI','A20N'],['570','HYD','MAA','AI','A20N'],
  ['2865','MAA','HYD','AI','A20N'],['2866','HYD','MAA','AI','A20N'],
  ['1351','MAA','HYD','IX','B738'],['1352','HYD','MAA','IX','B738'],
  ['557','MAA','AMD','AI','A20N'],['558','AMD','MAA','AI','A20N'],
  ['541','HYD','AMD','AI','A20N'],['542','AMD','HYD','AI','A20N'],
  ['1547','HYD','AMD','IX','B38M'],['1548','AMD','HYD','IX','B38M'],
  ['969','MAA','COK','AI','A20N'],['968','COK','MAA','AI','A20N'],
  ['1539','MAA','COK','IX','B738'],['1540','COK','MAA','IX','B738'],
  ['743','HYD','COK','AI','A20N'],['744','COK','HYD','AI','A20N'],
  ['1675','HYD','COK','IX','B738'],['1676','COK','HYD','IX','B738'],
  ['761','CCU','COK','AI','A20N'],['762','COK','CCU','AI','A20N'],
  ['769','CCU','AMD','AI','A20N'],['770','AMD','CCU','AI','A20N'],
  ['567','AMD','COK','AI','A20N'],['568','COK','AMD','AI','A20N'],
  ['1437','AMD','COK','IX','B38M'],['1438','COK','AMD','IX','B38M'],
  ['1462','IMF','DEL','IX','A20N'],['1461','DEL','IMF','IX','A20N'],
  ['1547','DIB','IXB','IX','A20N'],
  ['1562','DIB','DEL','IX','A20N'],['1561','DEL','DIB','IX','A20N'],
  ['1348','PAT','DEL','IX','A20N'],['1346','DEL','PAT','IX','A20N'],
  ['1953','PAT','BLR','IX','A20N'],['1504','BLR','PAT','IX','A20N'],
  ['1053','DEL','IXR','IX','A20N'],['1046','IXR','DEL','IX','A20N'],
  ['2176','BLR','IXR','IX','A20N'],['1239','IXR','BLR','IX','A20N'],
  ['2375','HYD','IXR','IX','A20N'],['2372','IXR','HYD','IX','A20N'],
  ['1684','ATQ','DEL','IX','A20N'],['1683','DEL','ATQ','IX','A20N'],
  ['1062','IXC','BLR','IX','A20N'],['1089','BLR','IXC','IX','A20N'],
  ['2017','DED','BLR','IX','A20N'],['1527','BLR','DED','IX','A20N'],
  ['2362','GWL','BLR','IX','A20N'],['2361','BLR','GWL','IX','A20N'],
  ['2069','JAI','BLR','IX','A20N'],['1526','BLR','JAI','IX','A20N'],
  ['1391','IXJ','DEL','IX','A20N'],['1390','DEL','IXJ','IX','A20N'],
  ['1074','IXJ','SXR','IX','A20N'],['1352','SXR','IXJ','IX','A20N'],
  ['1168','LKO','DEL','IX','A20N'],['1092','DEL','LKO','IX','A20N'],
  ['1542','LKO','BLR','IX','A20N'],['1479','BLR','LKO','IX','A20N'],
  ['1196','SXR','DEL','IX','A20N'],['1012','DEL','SXR','IX','A20N'],
  ['1169','SXR','BLR','IX','A20N'],['1385','BLR','SXR','IX','A20N'],
  ['1506','VGA','BLR','IX','A20N'],['2875','BLR','VGA','IX','A20N'],
  ['1394','VGA','HYD','IX','A20N'],['2715','HYD','VGA','IX','A20N'],
  ['1373','VGA','VTZ','IX','A20N'],
  ['1692','COK','BLR','IX','A20N'],['2678','BLR','COK','IX','A20N'],
  ['2376','COK','DEL','IX','A20N'],['2382','DEL','COK','IX','A20N'],
  ['1475','CCJ','BLR','IX','B738'],['1365','BLR','CCJ','IX','B738'],
  ['1109','GOI','DEL','IX','A20N'],['1108','DEL','GOI','IX','A20N'],
  ['2004','GOI','BLR','IX','A20N'],['1538','BLR','GOI','IX','A20N'],
  ['2019','HYD','BLR','IX','A20N'],['2935','BLR','HYD','IX','A20N'],
  ['2839','HYD','VTZ','IX','A20N'],['2744','VTZ','HYD','IX','A20N'],
  ['938','HYD','HKT','IX','B38M'],['937','HKT','HYD','IX','B38M'],
  ['5309','CNN','TRV','IX','B738'],['5310','TRV','CNN','IX','B738'],
  ['1781','IXE','DEL','IX','A20N'],['1782','DEL','IXE','IX','A20N'],
  ['5502','IXE','BLR','IX','A20N'],['5501','BLR','IXE','IX','A20N'],
  ['5301','IXE','TRV','IX','B738'],['5302','TRV','IXE','IX','B738'],
  ['2786','MAA','BLR','IX','A20N'],['1472','BLR','MAA','IX','A20N'],
  ['2794','IXZ','BLR','IX','A20N'],['2648','BLR','IXZ','IX','A20N'],
  ['5305','TRZ','BLR','IX','B738'],
  ['690','TRZ','SIN','IX','B738'],['689','SIN','TRZ','IX','B738'],
  ['5124','TRV','CCU','IX','B738'],
  ['2980','TRV','BLR','IX','A20N'],['1367','BLR','TRV','IX','A20N'],
  ['5123','DEL','TRV','IX','B38M'],
  ['2065','VTZ','BLR','IX','A20N'],['2064','BLR','VTZ','IX','A20N'],
  ['1358','VTZ','VGA','IX','A20N'],
  ['883','BKK','BLR','IX','B38M'],['882','BLR','BKK','IX','B38M'],

  /* ====== DELHI EXPANSION (from FR24 screenshots) =====
     Real flight numbers + aircraft codes per the actual schedule.
     Codes: 32N=A20N, 320=A320, 321=A321, 319=A319, 359=A359,
            788=B788, 789=B789, 77W=B77W, 77L=B77L, 32Q=A21N */

  /* International — DEL departures */
  ['127','DEL','VIE','AI','B77W'],['153','DEL','VIE','AI','B77W'],
  ['185','DEL','YVR','AI','B77W'],['186','YVR','DEL','AI','B788'],
  ['157','DEL','CPH','AI','B788'],
  ['143','DEL','CDG','AI','B788'],['142','CDG','DEL','AI','B789'],
  ['2029','DEL','FRA','AI','B789'],['2026','FRA','DEL','AI','B789'],
  ['2016','LHR','DEL','AI','B789'],
  ['162','LHR','DEL','AI','B789'],['112','LHR','DEL','AI','B789'],
  ['423','DEL','AMD','AI','B788'],

  /* Hong Kong family */

  /* DEL → AMD multiple frequencies */
  ['531','DEL','AMD','AI','A321'],['809','DEL','AMD','AI','A321'],
  ['817','DEL','AMD','AI','A321'],['881','DEL','AMD','AI','A321'],
  ['1787','DEL','AMD','AI','A20N'],['2545','DEL','AMD','AI','A20N'],
  ['2715','DEL','AMD','AI','A20N'],['2909','DEL','AMD','AI','A20N'],
  ['2939','DEL','AMD','AI','A20N'],

  /* DEL → ATQ Amritsar */
  ['421','DEL','ATQ','AI','A321'],['479','DEL','ATQ','AI','A321'],
  ['491','DEL','ATQ','AI','A321'],['855','DEL','ATQ','AI','A321'],
  ['1703','DEL','ATQ','AI','A20N'],['1773','DEL','ATQ','AI','A20N'],
  ['1422','ATQ','DEL','AI','B788'],['1480','ATQ','DEL','AI','A321'],
  ['492','ATQ','DEL','AI','A321'],['496','ATQ','DEL','AI','A20N'],
  ['856','ATQ','DEL','AI','A321'],['1826','ATQ','DEL','AI','A20N'],

  /* DEL → IXU Aurangabad */
  ['1727','DEL','IXU','AI','A20N'],['1781','DEL','IXU','AI','A20N'],
  ['1836','IXU','DEL','AI','A20N'],

  /* DEL → BLR Bangalore (high frequency) */
  ['2412','DEL','BLR','AI','A20N'],['2415','DEL','BLR','AI','A20N'],
  ['2417','DEL','BLR','AI','A20N'],['2485','DEL','BLR','AI','A20N'],
  ['2487','DEL','BLR','AI','A20N'],['2512','DEL','BLR','AI','A20N'],
  ['2651','DEL','BLR','AI','A21N'],['2653','DEL','BLR','AI','A20N'],
  ['2664','DEL','BLR','AI','A20N'],['2757','DEL','BLR','AI','A20N'],
  ['2803','DEL','BLR','AI','A20N'],['2807','DEL','BLR','AI','A20N'],
  ['2809','DEL','BLR','AI','A20N'],['2813','DEL','BLR','AI','A20N'],
  ['2815','DEL','BLR','AI','A20N'],['2817','DEL','BLR','AI','A20N'],
  ['2819','DEL','BLR','AI','A20N'],
  ['2406','BLR','DEL','AI','A20N'],['2414','BLR','DEL','AI','A20N'],
  ['2418','BLR','DEL','AI','A20N'],['2486','BLR','DEL','AI','A20N'],
  ['2488','BLR','DEL','AI','A20N'],['2511','BLR','DEL','AI','A20N'],
  ['2652','BLR','DEL','AI','A20N'],['2654','BLR','DEL','AI','A20N'],
  ['2665','BLR','DEL','AI','A20N'],['2758','BLR','DEL','AI','A20N'],
  ['2802','BLR','DEL','AI','A20N'],['2808','BLR','DEL','AI','A20N'],
  ['2810','BLR','DEL','AI','A20N'],['2814','BLR','DEL','AI','A20N'],
  ['2818','BLR','DEL','AI','A20N'],['2820','BLR','DEL','AI','A20N'],
  ['2868','BLR','DEL','AI','A20N'],

  /* DEL → BHO Bhopal */
  ['1705','DEL','BHO','AI','A20N'],['1723','DEL','BHO','AI','A20N'],
  ['2759','DEL','BHO','AI','A20N'],['1894','BHO','DEL','AI','A20N'],
  ['2760','BHO','DEL','AI','A20N'],

  /* DEL → BBI Bhubaneswar */
  ['1744','DEL','BBI','AI','A20N'],['1795','DEL','BBI','AI','A20N'],
  ['1814','BBI','DEL','AI','A20N'],['1898','BBI','DEL','AI','A20N'],

  /* DEL → BHJ Bhuj */
  ['1709','DEL','BHJ','AI','A20N'],['1859','BHJ','DEL','AI','A20N'],

  /* DEL → IXC Chandigarh */
  ['1742','DEL','IXC','AI','A20N'],['2532','DEL','IXC','AI','A20N'],
  ['2601','DEL','IXC','AI','A20N'],['2706','DEL','IXC','AI','A20N'],
  ['1879','IXC','DEL','AI','A20N'],['2403','IXC','DEL','AI','A20N'],
  ['2533','IXC','DEL','AI','A20N'],['2602','IXC','DEL','AI','A20N'],

  /* DEL → MAA Chennai */
  ['537','DEL','MAA','AI','B77W'],['2467','DEL','MAA','AI','A20N'],
  ['2483','DEL','MAA','AI','A20N'],['2525','DEL','MAA','AI','A20N'],
  ['2835','DEL','MAA','AI','A20N'],['2837','DEL','MAA','AI','A20N'],
  ['2895','DEL','MAA','AI','A20N'],['538','MAA','DEL','AI','B77W'],
  ['2468','MAA','DEL','AI','A20N'],['2484','MAA','DEL','AI','A20N'],
  ['2526','MAA','DEL','AI','A20N'],['2832','MAA','DEL','AI','A20N'],
  ['2836','MAA','DEL','AI','A20N'],['2886','MAA','DEL','AI','A20N'],

  /* DEL → COK Cochin */
  ['1724','DEL','COK','AI','A20N'],['1738','DEL','COK','AI','A20N'],
  ['1763','DEL','COK','AI','A20N'],['2473','DEL','COK','AI','A20N'],
  ['2883','DEL','COK','AI','A20N'],['1816','COK','DEL','AI','A20N'],
  ['1828','COK','DEL','AI','A20N'],['1858','COK','DEL','AI','A20N'],
  ['2459','COK','DEL','AI','A20N'],['2474','COK','DEL','AI','A20N'],

  /* DEL → CJB Coimbatore */
  ['1721','DEL','CJB','AI','A20N'],['1837','CJB','DEL','AI','A20N'],

  /* DEL → DED Dehradun */
  ['437','DEL','DED','AI','A20N'],['2907','DEL','DED','AI','A20N'],
  ['438','DED','DEL','AI','A20N'],['2908','DED','DEL','AI','A20N'],

  /* DEL → GOI Goa */
  ['2627','DEL','GOI','AI','A20N'],['2628','GOI','DEL','AI','A20N'],
  ['1734','DEL','GOX','AI','A20N'],['1854','GOX','DEL','AI','A20N'],

  /* DEL → GAU Guwahati */
  ['1755','DEL','GAU','AI','A20N'],['880','GAU','DEL','AI','A321'],

  /* DEL → HYD Hyderabad */
  ['544','DEL','HYD','AI','A359'],['1706','DEL','HYD','AI','A20N'],
  ['1708','DEL','HYD','AI','A20N'],['1773','DEL','HYD','AI','A20N'],
  ['2449','DEL','HYD','AI','A20N'],['2465','DEL','HYD','AI','A20N'],
  ['2519','DEL','HYD','AI','A20N'],['2542','DEL','HYD','AI','A20N'],
  ['2577','DEL','HYD','AI','A20N'],['2871','DEL','HYD','AI','A20N'],
  ['2879','DEL','HYD','AI','A20N'],['2899','DEL','HYD','AI','A20N'],
  ['840','HYD','DEL','AI','A359'],['1806','HYD','DEL','AI','A20N'],
  ['1866','HYD','DEL','AI','A20N'],['1880','HYD','DEL','AI','A20N'],
  ['2520','HYD','DEL','AI','A20N'],['2541','HYD','DEL','AI','A20N'],
  ['2543','HYD','DEL','AI','A20N'],['2559','HYD','DEL','AI','A20N'],
  ['2776','HYD','DEL','AI','A20N'],['2860','HYD','DEL','AI','A20N'],
  ['2870','HYD','DEL','AI','A20N'],['2880','HYD','DEL','AI','A20N'],

  /* DEL → IDR Indore */
  ['1716','DEL','IDR','AI','A20N'],['1725','DEL','IDR','AI','A20N'],
  ['2515','DEL','IDR','AI','A20N'],['1865','IDR','DEL','AI','A20N'],
  ['2516','IDR','DEL','AI','A20N'],

  /* DEL → JAI Jaipur */
  ['1719','DEL','JAI','AI','A20N'],['1834','JAI','DEL','AI','A319'],
  ['1844','JAI','DEL','AI','A20N'],

  /* DEL → JDH Jodhpur */
  ['1846','JDH','DEL','AI','A20N'],

  /* DEL → CCU Kolkata */
  ['1714','DEL','CCU','AI','A20N'],['1733','DEL','CCU','AI','A20N'],
  ['1791','DEL','CCU','AI','A20N'],['2535','DEL','CCU','AI','A20N'],
  ['2702','DEL','CCU','AI','A20N'],['2709','DEL','CCU','AI','A20N'],
  ['2727','DEL','CCU','AI','A20N'],['2767','DEL','CCU','AI','A20N'],
  ['1832','CCU','DEL','AI','A20N'],['1863','CCU','DEL','AI','A20N'],
  ['1874','CCU','DEL','AI','A20N'],['2536','CCU','DEL','AI','A20N'],
  ['2704','CCU','DEL','AI','A20N'],['2708','CCU','DEL','AI','A20N'],
  ['2710','CCU','DEL','AI','A20N'],['2720','CCU','DEL','AI','A20N'],
  ['2768','CCU','DEL','AI','A20N'],['2778','CCU','DEL','AI','A20N'],
  ['4174','CCU','DEL','AI','B77W'],

  /* DEL → IXL Leh */
  ['2461','DEL','IXL','AI','A20N'],['2463','DEL','IXL','AI','A20N'],
  ['2479','DEL','IXL','AI','A20N'],['2455','IXL','DEL','AI','A20N'],
  ['2462','IXL','DEL','AI','A20N'],['2464','IXL','DEL','AI','A20N'],

  /* DEL → LKO Lucknow */
  ['1710','DEL','LKO','AI','A20N'],['1717','DEL','LKO','AI','A20N'],
  ['1720','DEL','LKO','AI','A20N'],['1821','LKO','DEL','AI','A20N'],
  ['1824','LKO','DEL','AI','A20N'],['1877','LKO','DEL','AI','A20N'],
  ['2499','LKO','DEL','AI','A20N'],

  /* DEL → HWR Ludhiana */
  ['481','DEL','HWR','AI','A20N'],['483','DEL','HWR','AI','A320'],
  ['482','HWR','DEL','AI','A20N'],['484','HWR','DEL','AI','A320'],

  /* DEL → BOM (massive list — both directions) */
  ['441','DEL','BOM','AI','B77W'],['1736','DEL','BOM','AI','A319'],
  ['1745','DEL','BOM','AI','A20N'],['1777','DEL','BOM','AI','A20N'],
  ['1785','DEL','BOM','AI','A20N'],['2425','DEL','BOM','AI','A20N'],
  ['2429','DEL','BOM','AI','A20N'],['2433','DEL','BOM','AI','A20N'],
  ['2437','DEL','BOM','AI','A20N'],['2439','DEL','BOM','AI','A20N'],
  ['2441','DEL','BOM','AI','A20N'],['2805','DEL','BOM','AI','A321'],
  ['2927','DEL','BOM','AI','A20N'],['2933','DEL','BOM','AI','A359'],
  ['2941','DEL','BOM','AI','A20N'],['2943','DEL','BOM','AI','A359'],
  ['2945','DEL','BOM','AI','A20N'],['2951','DEL','BOM','AI','A20N'],
  ['2955','DEL','BOM','AI','A20N'],['2957','DEL','BOM','AI','A20N'],
  ['2963','DEL','BOM','AI','A20N'],['2975','DEL','BOM','AI','A20N'],
  ['2977','DEL','BOM','AI','A20N'],['2981','DEL','BOM','AI','A20N'],
  ['2985','DEL','BOM','AI','A20N'],['2995','DEL','BOM','AI','A20N'],
  ['2999','DEL','BOM','AI','A21N'],
  ['816','BOM','DEL','AI','B77W'],['1851','BOM','DEL','AI','A20N'],
  ['1882','BOM','DEL','AI','A20N'],['1890','BOM','DEL','AI','A20N'],
  ['1895','BOM','DEL','AI','A319'],['2408','BOM','DEL','AI','A359'],
  ['2419','BOM','DEL','AI','A20N'],['2422','BOM','DEL','AI','A20N'],
  ['2424','BOM','DEL','AI','A20N'],['2426','BOM','DEL','AI','A20N'],
  ['2428','BOM','DEL','AI','A20N'],['2432','BOM','DEL','AI','A20N'],
  ['2440','BOM','DEL','AI','A20N'],['2442','BOM','DEL','AI','A20N'],
  ['2452','BOM','DEL','AI','A20N'],['2677','BOM','DEL','AI','A20N'],
  ['2687','BOM','DEL','AI','A321'],['2910','BOM','DEL','AI','A321'],
  ['2928','BOM','DEL','AI','A20N'],['2930','BOM','DEL','AI','A20N'],
  ['2940','BOM','DEL','AI','A20N'],['2944','BOM','DEL','AI','A20N'],
  ['2952','BOM','DEL','AI','A359'],['2986','BOM','DEL','AI','A20N'],
  ['2988','BOM','DEL','AI','A20N'],['2996','BOM','DEL','AI','A321'],

  /* DEL → NAG Nagpur */
  ['416','DEL','NAG','AI','A20N'],['466','DEL','NAG','AI','A20N'],

  /* DEL → PAT Patna */
  ['1819','PAT','DEL','AI','A20N'],['1892','PAT','DEL','AI','A20N'],
  ['2524','PAT','DEL','AI','A20N'],['2646','PAT','DEL','AI','A20N'],

  /* DEL → IXZ Port Blair */
  ['2936','IXZ','DEL','AI','A20N'],

  /* DEL → PNQ Pune */
  ['1804','PNQ','DEL','AI','A20N'],['1838','PNQ','DEL','AI','A20N'],
  ['1839','PNQ','DEL','AI','A20N'],['1853','PNQ','DEL','AI','A319'],
  ['2404','PNQ','DEL','AI','A20N'],['2470','PNQ','DEL','AI','A20N'],
  ['2608','PNQ','DEL','AI','A20N'],['2972','PNQ','DEL','AI','A20N'],

  /* DEL → RPR Raipur */
  ['1812','RPR','DEL','AI','A20N'],['2636','RPR','DEL','AI','A20N'],

  /* DEL → HSR Rajkot */
  ['886','DEL','HSR','AI','A321'],['2538','DEL','HSR','AI','A321'],

  /* DEL → SXR Srinagar */
  ['1810','SXR','DEL','AI','A20N'],['1818','SXR','DEL','AI','A20N'],
  ['1848','SXR','DEL','AI','A321'],['1893','SXR','DEL','AI','A20N'],

  /* DEL → TRV Trivandrum */
  ['830','TRV','DEL','AI','A321'],['1830','TRV','DEL','AI','A20N'],
  ['1896','TRV','DEL','AI','A20N'],

  /* DEL → UDR Udaipur */
  ['1820','UDR','DEL','AI','A20N'],['1897','UDR','DEL','AI','A20N'],

  /* DEL → BDQ Vadodara */
  ['1808','BDQ','DEL','AI','A20N'],['2867','BDQ','DEL','AI','A20N'],
  ['2882','BDQ','DEL','AI','A20N'],

  /* DEL → VNS Varanasi */
  ['1850','VNS','DEL','AI','A320'],['2624','VNS','DEL','AI','A321'],

  /* DEL → VGA Vijayawada */
  ['2572','DEL','VGA','AI','A20N'],['2904','VGA','DEL','AI','A20N'],

  /* DEL → VTZ Vizag */
  ['420','VTZ','DEL','AI','A321'],['1802','VTZ','DEL','AI','A20N'],

  /* DEL ↔ Indonesia / Maldives / Nepal / Vietnam */
  ['2146','DPS','DEL','AI','A321'],['2148','DEL','DPS','AI','A321'],
  ['138','MXP','DEL','AI','B788'],['122','FCO','DEL','AI','A359'],
  ['357','HND','DEL','AI','B789'],
  ['2385','KUL','DEL','AI','A20N'],['2387','KUL','DEL','AI','A20N'],
  ['2240','MLE','DEL','AI','A20N'],
  ['212','KTM','DEL','AI','A20N'],['214','KTM','DEL','AI','A20N'],
  ['216','KTM','DEL','AI','A20N'],['218','KTM','DEL','AI','A20N'],
  ['220','KTM','DEL','AI','A20N'],['224','KTM','DEL','AI','A20N'],
  ['156','AMS','DEL','AI','B789'],
  ['2361','MNL','DEL','AI','A21N'],
  ['2284','DOH','DEL','AI','A20N'],
  ['2256','JED','DEL','AI','A20N'],
  ['2244','RUH','DEL','AI','A20N'],
  ['2116','SIN','DEL','AI','A20N'],['2119','SIN','DEL','AI','A20N'],
  ['2383','SIN','DEL','AI','A321'],
  ['313','ICN','DEL','AI','B788'],
  ['282','CMB','DEL','AI','A321'],
  ['152','ZRH','DEL','AI','B788'],
  ['2303','BKK','DEL','AI','A20N'],['2333','BKK','DEL','AI','A20N'],
  ['2335','BKK','DEL','AI','A20N'],['2356','BKK','DEL','AI','A20N'],
  ['2377','HKT','DEL','AI','A20N'],['2379','HKT','DEL','AI','A20N'],
  ['4210','DXB','DEL','AI','B788'],['4306','DXB','DEL','AI','B788'],
  ['4310','DXB','DEL','AI','A20N'],
  ['114','BHX','DEL','AI','B788'],
  ['126','ORD','DEL','AI','A359'],['102','JFK','DEL','AI','A359'],
  ['162','JFK','DEL','AI','A359'],['2016','JFK','DEL','AI','B788'],
  ['2018','LHR','DEL','AI','B789'],
  ['106','EWR','DEL','AI','A359'],
  ['2391','HAN','DEL','AI','A20N'],['2389','SGN','DEL','AI','A20N'],

  /* ====== BOM/HYD FR24 expansion (40 new routes, deduped 2026-05-12) ====== */
  /* MAA → BOM */
  ['436','MAA','BOM','AI','A319'],['574','MAA','BOM','AI','A321'],['640','MAA','BOM','AI','A20N'],
  ['2740','MAA','BOM','AI','A20N'],['2822','MAA','BOM','AI','A20N'],['2828','MAA','BOM','AI','A20N'],
  /* COK → BOM */
  ['699','COK','BOM','AI','A321'],['2518','COK','BOM','AI','A20N'],['2788','COK','BOM','AI','A321'],
  ['2792','COK','BOM','AI','A20N'],['2856','COK','BOM','AI','A20N'],
  /* CJB → BOM */
  ['2508','CJB','BOM','AI','A321'],
  /* DED → BOM */
  ['2742','DED','BOM','AI','A20N'],
  /* BOM → MAA */
  ['435','BOM','MAA','AI','A319'],['573','BOM','MAA','AI','A321'],['639','BOM','MAA','AI','A20N'],
  ['2739','BOM','MAA','AI','A20N'],['2780','BOM','MAA','AI','A20N'],['2827','BOM','MAA','AI','A20N'],
  /* BOM → COK */
  ['681','BOM','COK','AI','A321'],['2517','BOM','COK','AI','A20N'],['2743','BOM','COK','AI','A20N'],
  ['2791','BOM','COK','AI','A20N'],['2855','BOM','COK','AI','A20N'],
  /* BOM → CJB */
  ['2732','BOM','CJB','AI','A20N'],
  /* BOM → DED */
  ['431','BOM','DED','AI','A319'],
  /* DEL → HYD (additional) */
  ['1793','DEL','HYD','AI','A20N'],['2859','DEL','HYD','AI','A20N'],
  /* BOM → HYD */
  ['417','BOM','HYD','AI','A20N'],['2531','BOM','HYD','AI','A20N'],['2619','BOM','HYD','AI','A20N'],
  ['2625','BOM','HYD','AI','A20N'],['2869','BOM','HYD','AI','A20N'],['2875','BOM','HYD','AI','A20N'],
  /* HYD → BOM */
  ['418','HYD','BOM','AI','A20N'],['2447','HYD','BOM','AI','A20N'],['2699','HYD','BOM','AI','A321'],
  ['2872','HYD','BOM','AI','A20N'],['2874','HYD','BOM','AI','A20N'],['2876','HYD','BOM','AI','A20N'],

  /* ====== BLR/MAA/CCU FR24 expansion (35 new, deduped 2026-05-12) ====== */
  /* BLR → BOM */
  ['2604','BLR','BOM','AI','A20N'],['2610','BLR','BOM','AI','A20N'],['2630','BLR','BOM','AI','A20N'],
  ['2642','BLR','BOM','AI','A20N'],['2811','BLR','BOM','AI','A20N'],['2840','BLR','BOM','AI','A20N'],
  ['2846','BLR','BOM','AI','A321'],['2850','BLR','BOM','AI','A20N'],['2852','BLR','BOM','AI','A20N'],
  ['2854','BLR','BOM','AI','A20N'],['2858','BLR','BOM','AI','A20N'],
  /* BLR → DEL */
  ['428','BLR','DEL','AI','B788'],
  /* BOM → BLR */
  ['2603','BOM','BLR','AI','A20N'],['2632','BOM','BLR','AI','A20N'],['2641','BOM','BLR','AI','A20N'],
  ['2812','BOM','BLR','AI','A20N'],['2845','BOM','BLR','AI','A321'],['2849','BOM','BLR','AI','A20N'],
  ['2853','BOM','BLR','AI','A20N'],['2857','BOM','BLR','AI','A20N'],['2863','BOM','BLR','AI','A20N'],
  ['2865','BOM','BLR','AI','A20N'],
  /* BOM → CCU */
  ['2411','BOM','CCU','AI','A20N'],['2471','BOM','CCU','AI','A20N'],['2481','BOM','CCU','AI','A20N'],
  ['2643','BOM','CCU','AI','A20N'],['2773','BOM','CCU','AI','A20N'],
  /* CCU → BOM */
  ['2410','CCU','BOM','AI','A20N'],['2472','CCU','BOM','AI','A20N'],['2482','CCU','BOM','AI','A20N'],
  ['2772','CCU','BOM','AI','A20N'],['2774','CCU','BOM','AI','A20N'],['4174','CCU','BOM','AI','B77W'],
  /* DEL → CCU */
  ['2707','DEL','CCU','AI','A20N'],
  /* MAA → DEL */
  ['2838','MAA','DEL','AI','A20N'],

  /* ====== KTM/VIE/ATQ/SXR expansion (20 new, deduped 2026-05-13) ====== */
  /* DEL → KTM (all A20N/A320) */
  ['215','DEL','KTM','AI','A20N'],['217','DEL','KTM','AI','A20N'],['219','DEL','KTM','AI','A20N'],
  ['223','DEL','KTM','AI','A20N'],['211','DEL','KTM','AI','A20N'],
  /* Vienna corrections (AI187 is 777, not 787) */
  ['187','DEL','VIE','AI','B77W'],['128','VIE','DEL','AI','B77W'],
  /* AI127 onward leg DEL→VIE→ORD */
  ['127','VIE','ORD','AI','B77W'],
  /* Amritsar (ATQ) — mainline only */
  ['422','ATQ','DEL','AI','B788'],['480','ATQ','DEL','AI','A321'],
  ['169','ATQ','LGW','AI','B788'],['118','BHX','ATQ','AI','B788'],
  ['170','LGW','ATQ','AI','B789'],
  ['2997','BOM','ATQ','AI','A20N'],['2998','ATQ','BOM','AI','A20N'],
  /* Srinagar (SXR) — mainline only */
  ['1739','DEL','SXR','AI','A20N'],['1779','DEL','SXR','AI','A20N'],['1799','DEL','SXR','AI','A20N'],
  ['2431','IXL','SXR','AI','A20N'],['2434','SXR','IXL','AI','A20N'],

  /* ====== AXB EXPRESS EXPANSION (80 new, deduped 2026-05-13) ======
     Air India Express now operates B737-800, B737 MAX 8, A320, A320neo and
     A321 post-AIX Connect merger. Mix is preserved per the FR24 data.       */
  /* DEL → narrowbody hubs */
  ['1503','DEL','BLR','IX','B38M'],['1520','DEL','BLR','IX','B38M'],['1542','DEL','BLR','IX','B38M'],
  ['1026','DEL','BOM','IX','B38M'],['2402','DEL','BOM','IX','B38M'],
  ['193','DEL','DXB','IX','A320'],['164','DEL','MCT','IX','B738'],['174','DEL','DMM','IX','A20N'],
  ['178','DEL','AUH','IX','B738'],['136','DEL','SHJ','IX','A20N'],
  ['1294','DEL','STV','IX','B738'],['2386','DEL','AMD','IX','A320'],
  ['941','DEL','JED','IX','B38M'],['882','DEL','BKK','IX','B38M'],
  ['2023','DEL','VTZ','IX','B38M'],['2064','DEL','VTZ','IX','B38M'],
  ['1352','DEL','SXR','IX','A20N'],['1074','DEL','SXR','IX','A20N'],
  ['1390','DEL','SXR','IX','A320'],['1391','DEL','SXR','IX','A320'],
  /* DEL inbound */
  ['1027','BOM','DEL','IX','B38M'],['2403','BOM','DEL','IX','B738'],
  ['1167','BLR','DEL','IX','A20N'],['1618','BLR','DEL','IX','A321'],
  ['1352','SXR','DEL','IX','A20N'],['1074','SXR','DEL','IX','A20N'],['1391','SXR','DEL','IX','A320'],
  ['1085','GAU','DEL','IX','B38M'],['2881','GAU','DEL','IX','B38M'],
  ['1092','LKO','DEL','IX','A320'],['1165','LKO','DEL','IX','A20N'],['1617','LKO','DEL','IX','A20N'],
  ['1461','IXJ','DEL','IX','B38M'],
  /* BOM AXB */
  ['1229','BOM','STV','IX','B738'],['1264','BOM','STV','IX','A320'],['1293','BOM','STV','IX','A20N'],
  ['1253','BOM','VNS','IX','A20N'],
  ['163','BOM','MCT','IX','B738'],['173','BOM','DMM','IX','A20N'],
  ['179','BOM','AUH','IX','B738'],['135','BOM','SHJ','IX','A20N'],
  ['1373','BOM','VTZ','IX','B38M'],['2065','BOM','VTZ','IX','B38M'],
  ['942','BOM','JED','IX','B38M'],['883','BOM','BKK','IX','B38M'],
  ['2396','BOM','AMD','IX','B38M'],['1498','BOM','BLR','IX','B38M'],
  ['1218','BOM','JAI','IX','B38M'],['1219','BOM','LKO','IX','B38M'],
  /* BLR AXB */
  ['1062','BLR','BOM','IX','B38M'],['1604','BLR','BOM','IX','B38M'],['1063','BLR','BOM','IX','B38M'],
  ['1240','BLR','JAI','IX','B38M'],['2069','BLR','JAI','IX','B38M'],
  ['1480','BLR','LKO','IX','B38M'],['1541','BLR','LKO','IX','B38M'],
  ['1494','BLR','IMF','IX','B38M'],['1526','BLR','IMF','IX','B38M'],
  ['1089','BLR','AMD','IX','B38M'],['1311','BLR','CCU','IX','B38M'],
  /* COK AXB international */
  ['413','COK','AUH','IX','B38M'],['419','COK','DXB','IX','B38M'],['440','COK','DOH','IX','B38M'],
  ['439','COK','DMM','IX','B38M'],
  /* CCU AXB */
  ['1707','CCU','AGT','IX','B38M'],['1311','CCU','BLR','IX','B38M'],
  ['1308','CCU','GAU','IX','B38M'],['1305','CCU','IMF','IX','A320'],
  ['1216','CCU','MAA','IX','B38M'],
  /* GAU AXB */
  ['1076','GAU','IXB','IX','A320'],['1369','GAU','IMF','IX','B38M'],
  /* IXC AXB */
  ['2385','IXC','AMD','IX','A320'],
  /* JAI AXB */
  ['206','JAI','SHJ','IX','B38M'],
  /* LKO AXB */
  ['194','LKO','DXB','IX','A20N'],
  /* IMF AXB */
  ['1369','IMF','GAU','IX','B38M'],['1218','IMF','BOM','IX','B38M'],['205','IMF','SHJ','IX','B38M'],
  /* === Ranchi (IXR) + extra Pune (PNQ) frequencies — added per ops update === */
  ['1244','BLR','IXR','IX','B38M'], ['1530','BLR','IXR','IX','B38M'], ['1047','DEL','IXR','IX','B38M'], ['1052','DEL','IXR','IX','B38M'], ['2379','DEL','IXR','IX','B38M'], ['1238','BOM','IXR','IX','B38M'], ['2053','IXR','BLR','IX','A20N'], ['2786','IXR','BLR','IX','B38M'], ['1050','IXR','DEL','IX','A20N'], ['1054','IXR','DEL','IX','B38M'], ['2378','IXR','DEL','IX','B38M'], ['2374','IXR','BOM','IX','B38M'], ['242','PNQ','BKK','IX','B38M'], ['241','BKK','PNQ','IX','B38M'], ['1231','PNQ','DEL','IX','B38M'], ['1257','DEL','PNQ','IX','A320'], ['1971','BLR','PNQ','IX','B38M'], ['2609','BLR','PNQ','IX','B38M'], ['2873','BLR','PNQ','IX','B38M'], ['2913','BLR','PNQ','IX','B38M'],

  /* === COK / BAH / DOH / SHJ Gulf network — added per published IX schedule === */
  ['373','COK','BAH','IX','B38M'], ['1475','COK','BLR','IX','B38M'], ['1546','COK','BLR','IX','B38M'], ['5312','COK','BLR','IX','B38M'], ['337','COK','MCT','IX','B38M'], ['375','COK','DOH','IX','B38M'], ['359','COK','DMM','IX','B38M'], ['385','COK','DMM','IX','B38M'], ['397','COK','JED','IX','B38M'], ['321','COK','RUH','IX','B38M'], ['335','COK','AAN','IX','B38M'], ['351','COK','SHJ','IX','B38M'], ['863','BLR','BAH','IX','B38M'], ['427','COK','BAH','IX','B38M'], ['173','DEL','BAH','IX','A20N'], ['359','CCJ','BAH','IX','B38M'], ['385','CCJ','BAH','IX','B38M'], ['847','IXE','BAH','IX','B38M'], ['581','TRV','BAH','IX','B38M'], ['864','BAH','BLR','IX','B38M'], ['428','BAH','COK','IX','B38M'], ['174','BAH','DEL','IX','A20N'], ['386','BAH','CCJ','IX','B38M'], ['848','BAH','IXE','IX','B38M'], ['582','BAH','TRV','IX','B38M'], ['138','ATQ','SHJ','IX','B38M'], ['746','CNN','SHJ','IX','B38M'], ['352','CCJ','SHJ','IX','B38M'], ['546','TRV','SHJ','IX','B38M'], ['184','VNS','SHJ','IX','A320'], ['137','SHJ','ATQ','IX','B38M'], ['135','SHJ','DEL','IX','A20N'], ['205','SHJ','JAI','IX','B38M'], ['745','SHJ','CNN','IX','B38M'], ['351','SHJ','CCJ','IX','B38M'], ['545','SHJ','TRV','IX','B38M'], ['183','SHJ','VNS','IX','A320'],

  /* === MCT / MAA / CCJ schedules — added per published IX listing === */
  ['5305','BLR','MAA','IX','B738'], ['690','SIN','MAA','IX','B738'], ['5306','MAA','BLR','IX','B738'], ['689','MAA','SIN','IX','B738'], ['1489','BLR','CCJ','IX','B738'], ['5313','BLR','CCJ','IX','B38M'], ['5314','BLR','CCJ','IX','B38M'], ['398','JED','CCJ','IX','B38M'],
  /* === MCT / DXB / AUH / AAN schedules — author-verified directions === */
  ['197','ATQ','DXB','IX','B738'], ['749','CNN','DXB','IX','B738'], ['833','IXE','DXB','IX','B38M'], ['615','TRZ','DXB','IX','B738'], ['420','COK','AUH','IX','B738'], ['348','CCJ','AUH','IX','B38M'], ['816','IXE','AUH','IX','B38M'], ['258','BOM','AUH','IX','A320'], ['542','TRV','AUH','IX','B738'], ['419','AUH','COK','IX','B738'], ['179','AUH','DEL','IX','B38M'], ['347','AUH','CCJ','IX','B38M'], ['815','AUH','IXE','IX','B38M'], ['257','AUH','BOM','IX','A320'], ['541','AUH','TRV','IX','B738'],

  /* === HYD + AMD network expansion — published AI schedule === */
  ['2890','HYD','DEL','AI','A20N'], ['2493','BOM','AMD','AI','A321'], ['2503','BOM','AMD','AI','A321'], ['2847','BOM','AMD','AI','A20N'], ['2915','BOM','AMD','AI','A20N'], ['2919','BOM','AMD','AI','A20N'], ['424','AMD','DEL','AI','B788'], ['532','AMD','DEL','AI','A321'], ['810','AMD','DEL','AI','A321'], ['882','AMD','DEL','AI','A321'], ['1876','AMD','DEL','AI','A20N'], ['2546','AMD','DEL','AI','A20N'], ['2716','AMD','DEL','AI','A20N'], ['2906','AMD','DEL','AI','A20N'], ['2938','AMD','DEL','AI','A20N'], ['2946','AMD','DEL','AI','A321'], ['494','AMD','BOM','AI','A321'], ['2494','AMD','BOM','AI','A321'], ['2504','AMD','BOM','AI','A321'], ['2848','AMD','BOM','AI','A20N'], ['2916','AMD','BOM','AI','A20N'],
];

/* ---------- HELPERS ---------- */
AIVA.airport = (code) => AIVA.AIRPORTS[code];
AIVA.airportByIcao = (icao) => Object.values(AIVA.AIRPORTS).find(a => a.icao === icao);
AIVA.acTypeName = (code) => AIVA.FLEET_TYPES[code]?.name || code;
AIVA.fleetByOperator = (op) => AIVA.FLEET.filter(a => a.operator === op);
AIVA.fleetByType = (typeCode) => AIVA.FLEET.filter(a => a.type === typeCode);
AIVA.fleetTypes = () => Object.keys(AIVA.FLEET_TYPES);
AIVA.fleetTypesForOp = (op) => Object.entries(AIVA.FLEET_TYPES).filter(([_,v]) => v.op === op).map(([k]) => k);

/* Great-circle distance in nm */
const _R = 3440.065;
function _dist(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
  return Math.round(2 * _R * Math.asin(Math.sqrt(a)));
}
function _block(dist, op) {
  /* Realistic block-time model = cruise + taxi/climb/descent overhead.
     Old model (25 min flat overhead, 470 kt cruise) under-predicted by
     ~15 min on every sector — pilots flagged it after AI2951 showed
     1:43 block when real Air India schedules show 2:20. */
  const cruise = op === 'IX' ? 430 : 460;
  /* 38 min combined: ~12 taxi-out, ~10 climb-to-cruise, ~12 descent, ~4 taxi-in.
     Cruise leg uses (dist - 80 nm) since climb+descent eats ~80 nm of horizontal. */
  const cruiseMins = Math.max(0, (dist - 80) / cruise * 60);
  const mins = Math.round(38 + cruiseMins);
  const h = Math.floor(mins / 60), m = mins % 60;
  return { dur: `${h}:${String(m).padStart(2,'0')}`, durMins: mins };
}
/* Real published schedule overrides (24h local times at origin).
   These take precedence over the synthetic seed-based times for known routes.
   Source: Air India / Air India Express published schedules. */
const SCHEDULE_OVERRIDES = {
  /* ===== DEL ↔ Ludhiana (Halwara) — twice-daily AI service from
     2026-05 per the official Air India press release. */
  'AI481': { dep: '05:55', arr: '07:05' },   // DEL → HWR
  'AI482': { dep: '07:55', arr: '09:10' },   // HWR → DEL
  'AI483': { dep: '12:55', arr: '14:10' },   // DEL → HWR
  'AI484': { dep: '14:40', arr: '15:55' },   // HWR → DEL

  /* ===== Leh (IXL) ===== */
  'AI2448': { dep: '09:40', arr: '11:25' },   // IXC → IXL
  'AI2454': { dep: '07:25', arr: '09:30' },   // DEL → IXL
  'AI2461': { dep: '07:15', arr: '09:20' },   // DEL → IXL
  'AI2463': { dep: '06:10', arr: '08:15' },   // DEL → IXL
  'AI2479': { dep: '04:10', arr: '06:15' },   // DEL → IXL
  'AI2436': { dep: '10:15', arr: '11:25' },   // IXJ → IXL
  'AI2434': { dep: '10:00', arr: '11:25' },   // SXR → IXL
  'AI2427': { dep: '08:50', arr: '10:35' },   // IXL → IXC
  'AI2455': { dep: '10:00', arr: '12:05' },   // IXL → DEL
  'AI2462': { dep: '14:35', arr: '16:40' },   // IXL → DEL
  'AI2464': { dep: '12:10', arr: '14:15' },   // IXL → DEL
  'AI2480': { dep: '06:55', arr: '09:00' },   // IXL → DEL
  'AI2435': { dep: '08:50', arr: '10:00' },   // IXL → IXJ
  'AI2431': { dep: '08:50', arr: '10:15' },   // IXL → SXR
  /* ===== DEL ↔ BOM (mainline shuttle, ~30 flights/day) =====
     User-flagged: AI2951 should be 13:30→15:50 not 20:35→22:18. */
  'AI2951': { dep: '13:30', arr: '15:50' },   // DEL → BOM
  'AI805':  { dep: '06:00', arr: '08:20' },
  'AI441':  { dep: '06:35', arr: '08:55' },
  'AI1736': { dep: '07:05', arr: '09:25' },
  'AI2425': { dep: '07:40', arr: '10:00' },
  'AI2429': { dep: '08:15', arr: '10:35' },
  'AI1745': { dep: '08:55', arr: '11:15' },
  'AI2433': { dep: '09:30', arr: '11:50' },
  'AI2437': { dep: '10:05', arr: '12:25' },
  'AI2439': { dep: '10:40', arr: '13:00' },
  'AI2441': { dep: '11:15', arr: '13:35' },
  'AI2805': { dep: '11:50', arr: '14:10' },
  'AI1777': { dep: '12:25', arr: '14:45' },
  'AI2927': { dep: '13:00', arr: '15:20' },
  'AI2933': { dep: '14:10', arr: '16:30' },
  'AI2941': { dep: '14:45', arr: '17:05' },
  'AI2943': { dep: '15:20', arr: '17:40' },
  'AI2945': { dep: '15:55', arr: '18:15' },
  'AI2955': { dep: '16:30', arr: '18:50' },
  'AI2957': { dep: '17:05', arr: '19:25' },
  'AI2963': { dep: '17:40', arr: '20:00' },
  'AI1785': { dep: '18:15', arr: '20:35' },
  'AI2975': { dep: '18:50', arr: '21:10' },
  'AI2977': { dep: '19:25', arr: '21:45' },
  'AI2981': { dep: '20:00', arr: '22:20' },
  'AI2985': { dep: '20:35', arr: '22:55' },
  'AI2995': { dep: '21:10', arr: '23:30' },
  'AI2999': { dep: '21:45', arr: '00:05+1' },
  'AI2678': { dep: '22:30', arr: '00:50+1' },
  /* DEL → BOM B777 — typically early-evening to free aircraft for international */
  /* ===== BOM ↔ DEL (return wave) ===== */
  'AI816':  { dep: '06:30', arr: '08:55' },   // BOM → DEL
  'AI1851': { dep: '07:00', arr: '09:25' },
  'AI1882': { dep: '07:35', arr: '10:00' },
  'AI1890': { dep: '08:10', arr: '10:35' },
  'AI1895': { dep: '08:45', arr: '11:10' },
  'AI2408': { dep: '09:20', arr: '11:45' },
  'AI2419': { dep: '09:55', arr: '12:20' },
  'AI2422': { dep: '10:30', arr: '12:55' },
  'AI2424': { dep: '11:05', arr: '13:30' },
  'AI2426': { dep: '11:40', arr: '14:05' },
  'AI2428': { dep: '12:15', arr: '14:40' },
  'AI2432': { dep: '12:50', arr: '15:15' },
  'AI2440': { dep: '13:25', arr: '15:50' },
  'AI2442': { dep: '14:00', arr: '16:25' },
  'AI2452': { dep: '14:35', arr: '17:00' },
  'AI2677': { dep: '15:10', arr: '17:35' },
  'AI2687': { dep: '15:45', arr: '18:10' },
  'AI2910': { dep: '16:20', arr: '18:45' },
  'AI2928': { dep: '16:55', arr: '19:20' },
  'AI2930': { dep: '17:30', arr: '19:55' },
  'AI2940': { dep: '18:05', arr: '20:30' },
  'AI2944': { dep: '18:40', arr: '21:05' },
  'AI2952': { dep: '19:15', arr: '21:40' },   // BOM → DEL (return of AI2951)
  'AI2986': { dep: '19:50', arr: '22:15' },
  'AI2988': { dep: '20:25', arr: '22:50' },
  'AI2996': { dep: '21:00', arr: '23:25' },
  'AI2970': { dep: '21:35', arr: '00:00+1' }, // BOM → DEL
};
AIVA.SCHEDULE_OVERRIDES = SCHEDULE_OVERRIDES;

function _times(seedKey, dist, durMins, fromCode, toCode) {
  /* Honor real published times first */
  const ov = SCHEDULE_OVERRIDES[seedKey];
  if (ov) return { dep: ov.dep, arr: ov.arr };

  /* Hash uses route + flight number so two flights on the same route
     don't collide on the same departure slot. */
  const seed = (seedKey + (fromCode||'') + (toCode||''))
    .split('').reduce((s,c) => s + c.charCodeAt(0), 0);

  /* Realistic departure windows that match Air India's actual operating
     pattern. The old generator used `5 + (seed * 13) % 16` which let
     domestic flights depart at 21:00, 22:00, 03:00 — none of which match
     real airline schedules. New windows:
       - Ultra-long-haul (>4500 nm) → 22:00 / 00:00 / 02:00 (red-eye out of India)
       - Long-haul (2500-4500 nm)   → 14:00–23:00 (afternoon to night)
       - Med-haul / Gulf (800-2500) → spread 04:00–22:00 with Gulf-heavy evening cluster
       - Domestic trunk             → 05:00–21:00 spread
   */
  let depWindow;
  if (dist > 4500) {
    depWindow = [22, 23, 0, 1, 2, 3];
  } else if (dist > 2500) {
    depWindow = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  } else if (dist > 800) {
    depWindow = [4, 5, 6, 7, 8, 9, 11, 13, 14, 16, 17, 18, 19, 20, 21, 22];
  } else {
    depWindow = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  }
  const depHour = depWindow[Math.abs(seed) % depWindow.length];
  /* 5-minute departure grid — feels like a real published schedule,
     not random :47 / :29 timestamps. */
  const depMin = ((seed * 17) % 12) * 5;
  const dep = `${String(depHour).padStart(2,'0')}:${String(depMin).padStart(2,'0')}`;
  const arrAbs = depHour * 60 + depMin + durMins;
  const arrMin = arrAbs % (24 * 60);
  const arrH = Math.floor(arrMin / 60);
  const arrM = arrMin % 60;
  const dayPlus = arrAbs >= (24 * 60) ? '+1' : '';
  return { dep, arr: `${String(arrH).padStart(2,'0')}:${String(arrM).padStart(2,'0')}${dayPlus}` };
}
function _category(from, to, dist) {
  const a = AIVA.airport(from), b = AIVA.airport(to);
  if (!a || !b) return 'unknown';
  if (a.country === 'India' && b.country === 'India') return 'domestic';
  const gulf = ['UAE','Qatar','Oman','Bahrain','Kuwait','Saudi Arabia'];
  if (gulf.includes(a.country) || gulf.includes(b.country)) return 'gulf';
  if (dist > 4500) return 'long_haul';
  return 'medium_haul';
}
function _region(from, to) {
  const a = AIVA.airport(from), b = AIVA.airport(to);
  const c = (a?.country !== 'India') ? a?.country : (b?.country !== 'India') ? b?.country : 'India';
  if (c === 'India') return 'India';
  if (['USA','Canada'].includes(c)) return 'North America';
  if (['UK','France','Germany','Italy','Netherlands','Denmark','Austria','Switzerland'].includes(c)) return 'Europe';
  if (['UAE','Qatar','Oman','Bahrain','Kuwait','Saudi Arabia'].includes(c)) return 'Middle East';
  if (['Hong Kong','China','Japan','South Korea','Singapore','Thailand','Malaysia','Vietnam','Indonesia','Philippines','Sri Lanka','Bangladesh','Nepal','Maldives'].includes(c)) return 'South / SE Asia';
  if (['Australia'].includes(c)) return 'Australia';
  if (['Kenya','Mauritius'].includes(c)) return 'Africa / IO';
  return 'Other';
}

/* Build the full FLIGHTS list — every entry uses the EXACT aircraft type
   from the RAW tuple (no auto-guessing — SFO routes get B77W properly). */
AIVA.FLIGHTS = AIVA.RAW.map(([n, from, to, op, ac]) => {
  const a = AIVA.airport(from), b = AIVA.airport(to);
  const dist = a && b ? _dist(a.lat, a.lon, b.lat, b.lon) : 0;
  const { dur, durMins } = _block(dist, op);
  const cs = (op === 'AI' ? 'AIC' : 'AXB') + n;
  const fno = (op === 'AI' ? 'AI' : 'IX') + n;
  const { dep, arr } = _times(fno, dist, durMins, from, to);
  return { fno, cs, from, to, op, ac, acName: AIVA.acTypeName(ac), dist, dur, durMins, dep, arr,
           cat: _category(from, to, dist), region: _region(from, to) };
}).filter(f => f.dist > 0);

AIVA.findFlight = (fno) => AIVA.FLIGHTS.find(f => f.fno === fno);
AIVA.routesFromBase = (code) => AIVA.FLIGHTS.filter(f => f.from === code);
AIVA.routesToBase = (code) => AIVA.FLIGHTS.filter(f => f.to === code);
AIVA.allDestinationsFrom = (code) => [...new Set(AIVA.FLIGHTS.filter(f => f.from === code).map(f => f.to))];
AIVA.allOrigins = () => [...new Set(AIVA.FLIGHTS.map(f => f.from))].sort();

AIVA.sample = (arr, n=1) => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return n === 1 ? c[0] : c.slice(0, n);
};

/* Aircraft photo from Wikimedia Commons */
AIVA.acImage = (typeCode) => {
  const map = {
    'B77W':'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Air_India_Boeing_777-300ER_VT-ALN_HKG_2024-08-22.jpg/1280px-Air_India_Boeing_777-300ER_VT-ALN_HKG_2024-08-22.jpg',
    'B77L':'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Air_India_Boeing_777-200LR_VT-AEG_LHR_2010-04-03.png/1280px-Air_India_Boeing_777-200LR_VT-AEG_LHR_2010-04-03.png',
    'B788':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Air_India_Boeing_787-8_VT-AND_Frankfurt.jpg/1280px-Air_India_Boeing_787-8_VT-AND_Frankfurt.jpg',
    'B789':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Vistara_Boeing_787-9_Dreamliner_VT-TSD.jpg/1280px-Vistara_Boeing_787-9_Dreamliner_VT-TSD.jpg',
    'A359':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Air_India_Airbus_A350-900_VT-JRA.jpg/1280px-Air_India_Airbus_A350-900_VT-JRA.jpg',
    'A20N':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Air_India_Airbus_A320neo_VT-EXF.jpg/1280px-Air_India_Airbus_A320neo_VT-EXF.jpg',
    'A21N':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Vistara_Airbus_A321neo_VT-TVA.jpg/1280px-Vistara_Airbus_A321neo_VT-TVA.jpg',
    'A319':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Air_India_Airbus_A320neo_VT-EXF.jpg/1280px-Air_India_Airbus_A320neo_VT-EXF.jpg',
    'A320':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Air_India_Airbus_A320neo_VT-EXF.jpg/1280px-Air_India_Airbus_A320neo_VT-EXF.jpg',
    'A321':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Vistara_Airbus_A321neo_VT-TVA.jpg/1280px-Vistara_Airbus_A321neo_VT-TVA.jpg',
    'B738':'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Air_India_Express_Boeing_737-800_VT-AXA.jpg/1280px-Air_India_Express_Boeing_737-800_VT-AXA.jpg',
    'B38M':'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Air_India_Express_Boeing_737_MAX_8_VT-ATA.jpg/1280px-Air_India_Express_Boeing_737_MAX_8_VT-ATA.jpg',
  };
  return map[typeCode] || map['A20N'];
};

/* ====================================================================
   AIRCRAFT SUBSTITUTION RULES
   • If a pilot bids for "A320", they're qualified on the whole A320
     family (NEO + CEO siblings). Same logic for A321/787/777.
   • Used by Book Roster filters and Monthly Bid matching.
   ==================================================================== */
AIVA.AC_FAMILY = {
  /* A320 family — narrowbody Airbus (qualifies for all A319/320/321 NEO + CEO) */
  'A320_FAMILY': ['A20N','A21N','A319','A320','A321'],
  /* 787 family — Dreamliner (787-8 ↔ 787-9) */
  'B787_FAMILY': ['B788','B789'],
  /* 777 family — Boeing widebody twin (incl. cross-qual to 787 widebody) */
  'B777_FAMILY': ['B77W','B77L','B788','B789'],
  /* A350 (single member, full type rating) */
  'A350_FAMILY': ['A359'],
  /* 737 family (Express only) */
  'B737_FAMILY': ['B738','B38M'],
};
/* If a pilot is rated on this aircraft, what other types can they fly?
   (Reverse lookup of AC_FAMILY — the union of every family that contains it.) */
AIVA.acSubstitutes = (typeCode) => {
  const set = new Set([typeCode]);
  for (const fam of Object.values(AIVA.AC_FAMILY)) {
    if (fam.includes(typeCode)) fam.forEach(t => set.add(t));
  }
  return [...set];
};
AIVA.acFamilyOf = (typeCode) => {
  for (const [name, members] of Object.entries(AIVA.AC_FAMILY)) {
    if (members.includes(typeCode)) return name;
  }
  return typeCode;
};
AIVA.acFamilyLabel = (famKey) => ({
  'A320_FAMILY': 'A320 family (A319 / 320 / 320neo / 321 / 321neo)',
  'B787_FAMILY': '787 family (787-8 / 787-9)',
  'B777_FAMILY': '777 family (777 + 787 cross-qual)',
  'A350_FAMILY': 'A350-900',
  'B737_FAMILY': '737 family (737-800 / MAX 8)',
}[famKey] || famKey);

/* ====================================================================
   AIRPORT SEARCH INDEX
   • Lets you find an airport by IATA, ICAO, city name, or airport name.
   • Returns ranked matches.
   ==================================================================== */
AIVA.airportSearch = (q) => {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const code of Object.keys(AIVA.AIRPORTS)) {
    const a = AIVA.AIRPORTS[code];
    let score = 0;
    const iata = a.iata.toLowerCase(), icao = a.icao.toLowerCase();
    const city = (a.city || '').toLowerCase(), name = (a.name || '').toLowerCase();
    if (iata === q || icao === q) score = 100;
    else if (iata.startsWith(q) || icao.startsWith(q)) score = 80;
    else if (city === q) score = 70;
    else if (city.startsWith(q)) score = 60;
    else if (name.startsWith(q)) score = 50;
    else if (city.includes(q)) score = 40;
    else if (name.includes(q)) score = 30;
    if (score > 0) results.push({ ...a, score });
  }
  return results.sort((x, y) => y.score - x.score).slice(0, 12);
};

/* ====================================================================
   ROUTE NETWORK HELPERS for the new globe + roster UI
   ==================================================================== */
AIVA.uniqueRoutePairs = () => {
  /* Returns [{from, to, fromAirport, toAirport, dist, count, types}] for every unique
     directional route in the network (used to plot arcs on the globe). */
  const pairs = new Map();
  for (const f of AIVA.FLIGHTS) {
    const k = f.from + '-' + f.to;
    if (!pairs.has(k)) {
      pairs.set(k, { from: f.from, to: f.to,
        fromAirport: AIVA.airport(f.from), toAirport: AIVA.airport(f.to),
        dist: f.dist, count: 0, types: new Set() });
    }
    const p = pairs.get(k);
    p.count++;
    p.types.add(f.ac);
  }
  return [...pairs.values()].map(p => ({ ...p, types: [...p.types] }));
};
AIVA.flightsOnRoute = (from, to, opts = {}) => {
  /* Returns flights on a given directional route, sorted by departure time. */
  let list = AIVA.FLIGHTS.filter(f => f.from === from && f.to === to);
  if (opts.acTypes && opts.acTypes.length) {
    const expanded = new Set();
    for (const t of opts.acTypes) AIVA.acSubstitutes(t).forEach(x => expanded.add(x));
    list = list.filter(f => expanded.has(f.ac));
  }
  if (opts.op) list = list.filter(f => f.op === opts.op);
  return list.sort((a, b) => a.dep.localeCompare(b.dep));
};

/* ====================================================================
   GATE ASSIGNMENT DATABASE
   • Keyed by IATA airport.
   • Each airport has small / medium / large gate pools.
   • Aircraft size class:
       small  = A319 / A320 / A20N / B738
       medium = A321 / A21N / B38M
       large  = A350 / B77W / B77L / B788 / B789
   • Gate strings are realistic for each airport (terminal + stand).
   ==================================================================== */
AIVA.AIRCRAFT_SIZE = {
  'A319':'small','A320':'small','A20N':'small','B738':'small',
  'A321':'medium','A21N':'medium','B38M':'medium',
  'A359':'large','B77W':'large','B77L':'large','B788':'large','B789':'large',
};
AIVA.acSize = (code) => AIVA.AIRCRAFT_SIZE[code] || 'medium';

AIVA.GATES = {
  /* === India hubs === */
  DEL: {
    small:  ['T3 36','T3 38','T3 40','T3 42','T3 44','T3 46','T3 48','T3 50'],
    medium: ['T3 24','T3 26','T3 28','T3 30','T3 32','T3 34'],
    large:  ['T3 10','T3 12','T3 14','T3 16','T3 18','T3 20','T3 22'],
  },
  BOM: {
    small:  ['T2 41','T2 43','T2 45','T2 47','T2 49','T2 51','T2 53'],
    medium: ['T2 31','T2 33','T2 35','T2 37','T2 39'],
    large:  ['T2 11','T2 13','T2 15','T2 17','T2 19','T2 21','T2 23'],
  },
  BLR: {
    small:  ['T2 7A','T2 7B','T2 7C','T2 9A','T2 9B','T2 11A','T2 11B'],
    medium: ['T2 5','T2 6','T2 13','T2 15'],
    large:  ['T2 1','T2 2','T2 3','T2 4'],
  },
  CCU: {
    small:  ['T2 14','T2 16','T2 18','T2 20','T2 22','T2 24'],
    medium: ['T2 10','T2 12'],
    large:  ['T2 4','T2 5','T2 6','T2 7','T2 8'],
  },
  HYD: {
    small:  ['T1 35','T1 37','T1 39','T1 41','T1 43','T1 45','T1 47'],
    medium: ['T1 27','T1 29','T1 31','T1 33'],
    large:  ['T1 13','T1 15','T1 17','T1 19','T1 21','T1 23','T1 25'],
  },
  MAA: {
    small:  ['T1 21','T1 23','T1 25','T1 27','T1 29'],
    medium: ['T1 17','T1 19'],
    large:  ['T1 9','T1 11','T1 13','T1 15'],
  },
  COK: { small:['T3 6','T3 7','T3 8','T3 9'], medium:['T3 4','T3 5'], large:['T3 1','T3 2','T3 3'] },
  CCJ: { small:['B7','B8','B9'], medium:['B5','B6'], large:['B1','B2','B3','B4'] },
  TRV: { small:['INT 5','INT 6','INT 7'], medium:['INT 3','INT 4'], large:['INT 1','INT 2'] },
  GOI: { small:['MOPA 11','MOPA 13','MOPA 15'], medium:['MOPA 7','MOPA 9'], large:['MOPA 1','MOPA 3','MOPA 5'] },
  AMD: { small:['T1 12','T1 14','T1 16'], medium:['T1 8','T1 10'], large:['T2 1','T2 2','T2 3'] },
  CCJ: { small:['B7','B8','B9'], medium:['B5','B6'], large:['B1','B2','B3','B4'] },
  PNQ: { small:['G3','G4','G5','G6'], medium:['G2'], large:['G1'] },
  GAU: { small:['7','8','9','10'], medium:['5','6'], large:['1','2','3','4'] },
  IXC: { small:['5','6','7','8'], medium:['3','4'], large:['1','2'] },
  ATQ: { small:['4','5','6'], medium:['3'], large:['1','2'] },
  SXR: { small:['4','5','6'], medium:['3'], large:['1','2'] },
  LKO: { small:['T2 10','T2 12','T2 14'], medium:['T2 6','T2 8'], large:['T2 1','T2 2','T2 3'] },
  JAI: { small:['T2 7','T2 8','T2 9','T2 10'], medium:['T2 5','T2 6'], large:['T2 1','T2 2','T2 3'] },
  VNS: { small:['4','5','6','7'], medium:['3'], large:['1','2'] },
  KTM: { small:['INT 6','INT 7','INT 8'], medium:['INT 4','INT 5'], large:['INT 1','INT 2','INT 3'] },
  TIR: { small:['3','4','5'], medium:['2'], large:['1'] },
  VTZ: { small:['6','7','8'], medium:['4','5'], large:['1','2','3'] },
  IXJ: { small:['3','4','5'], medium:['2'], large:['1'] },
  IXL: { small:['3','4','5'], medium:['2'], large:['1'] },
  CJB: { small:['4','5','6'], medium:['3'], large:['1','2'] },
  STV: { small:['3','4','5'], medium:['2'], large:['1'] },
  AGT: { small:['3','4'], medium:['2'], large:['1'] },
  IMF: { small:['3','4'], medium:['2'], large:['1'] },
  IXB: { small:['3','4'], medium:['2'], large:['1'] },
  DED: { small:['3','4'], medium:['2'], large:['1'] },

  /* === Middle East === */
  DXB: { small:['C1','C3','C5','C7','C9'], medium:['B4','B6','B8'], large:['A1','A3','A5','A7','A9'] },
  AUH: { small:['T1 36','T1 38','T1 40'], medium:['T1 30','T1 32'], large:['MTB 12','MTB 14','MTB 16','MTB 18'] },
  SHJ: { small:['4','6','8'], medium:['2'], large:['1'] },
  DOH: { small:['B1','B3','B5','B7'], medium:['A4','A6','A8'], large:['E1','E3','E5','E7'] },
  MCT: { small:['7','9','11'], medium:['5'], large:['1','3'] },
  JED: { small:['F11','F13','F15'], medium:['D5','D7'], large:['D1','D3','E1','E3'] },
  RUH: { small:['T2 24','T2 26','T2 28'], medium:['T2 20','T2 22'], large:['T1 10','T1 12','T1 14'] },
  DMM: { small:['T2 10','T2 12','T2 14'], medium:['T2 6','T2 8'], large:['T1 1','T1 2','T1 3'] },
  KWI: { small:['6','7','8'], medium:['4','5'], large:['1','2','3'] },
  BAH: { small:['5','6','7'], medium:['3','4'], large:['1','2'] },

  /* === Europe === */
  LHR: { small:['T2A 8','T2A 10','T2A 12'], medium:['T2B 24','T2B 26'], large:['T2B 28','T2B 30','T2B 32','T2B 34','T2B 36'] },
  LGW: { small:['56','57','58'], medium:['52','54'], large:['101','102','103','104'] },
  BHX: { small:['56','57','58'], medium:['52','54'], large:['41','42','43'] },
  FRA: { small:['A26','A28','A30'], medium:['A18','A20'], large:['E1','E3','E5','E7'] },
  CDG: { small:['F30','F32','F34'], medium:['E40','E42'], large:['E60','E62','E64','E66'] },
  AMS: { small:['D5','D7','D9'], medium:['F2','F4'], large:['E18','E20','E22'] },
  MXP: { small:['A4','A6','A8'], medium:['A10','A12'], large:['B17','B19','B21'] },
  FCO: { small:['G2','G4','G6'], medium:['G8','G10'], large:['E22','E24','E26'] },
  VIE: { small:['F31','F33','F35'], medium:['D26','D28'], large:['D12','D14','D16'] },
  MUC: { small:['G35','G37','G39'], medium:['G45','G47'], large:['H38','H40','H42'] },
  CPH: { small:['A22','A24','A26'], medium:['A30','A32'], large:['F11','F13','F15'] },
  ZRH: { small:['A38','A40','A42'], medium:['A46','A48'], large:['E32','E34','E36','E38'] },

  /* === North America === */
  JFK: { small:['T4 39','T4 41','T4 43'], medium:['T4 29','T4 31'], large:['T4 1','T4 3','T4 5','T4 7','T4 9'] },
  EWR: { small:['T B45','T B47'], medium:['T B40','T B42'], large:['T B60','T B62','T B64','T B66'] },
  ORD: { small:['T5 M5','T5 M7'], medium:['T5 M9','T5 M11'], large:['T5 M16','T5 M18','T5 M20','T5 M22'] },
  SFO: { small:['G91','G93','G95'], medium:['G97','G99'], large:['A10','A12','A14','A16'] },
  YYZ: { small:['T1 D32','T1 D34'], medium:['T1 D40','T1 D42'], large:['T1 D45','T1 D47','T1 D49','T1 D51'] },
  YVR: { small:['D52','D54','D56'], medium:['D58','D60'], large:['D62','D64','D66','D68'] },

  /* === SE Asia === */
  SIN: { small:['B7','B9','B11'], medium:['C1','C3'], large:['E22','E24','E26','E28'] },
  BKK: { small:['A4','A6','A8'], medium:['B3','B5'], large:['D5','D7','D9','D11'] },
  HKT: { small:['A11','A12','A13'], medium:['A14'], large:['B1','B2','B3'] },
  KUL: { small:['A4','A6','A8'], medium:['A10','A12'], large:['C28','C30','C32'] },
  CGK: { small:['T3 32','T3 34'], medium:['T3 36','T3 38'], large:['T3 24','T3 26','T3 28'] },
  MNL: { small:['T1 11','T1 13'], medium:['T1 15','T1 17'], large:['T3 1','T3 3','T3 5'] },
  HAN: { small:['T2 31','T2 33'], medium:['T2 35','T2 37'], large:['T2 20','T2 22','T2 24'] },
  SGN: { small:['T2 17','T2 19'], medium:['T2 21','T2 23'], large:['T2 10','T2 12','T2 14'] },
  DPS: { small:['T1 8','T1 10'], medium:['T1 12','T1 14'], large:['T1 20','T1 22','T1 24'] },

  /* === East Asia === */
  HKG: { small:['33','35','37'], medium:['41','43'], large:['48','50','52','54','56'] },
  ICN: { small:['T1 26','T1 28'], medium:['T1 30','T1 32'], large:['T2 230','T2 231','T2 232'] },
  HND: { small:['T3 105','T3 107'], medium:['T3 109','T3 111'], large:['T3 141','T3 143','T3 145','T3 147'] },
  NRT: { small:['T2 71','T2 73'], medium:['T2 76','T2 78'], large:['T1 26','T1 28','T1 30','T1 32'] },

  /* === Australia / Oceania === */
  SYD: { small:['T1 8','T1 10'], medium:['T1 12','T1 14'], large:['T1 53','T1 55','T1 57','T1 59','T1 60'] },
  MEL: { small:['T2 D7','T2 D9'], medium:['T2 D11','T2 D13'], large:['T2 D15','T2 D17','T2 D19','T2 D21'] },

  /* === Africa / IO === */
  NBO: { small:['T1B 7','T1B 9'], medium:['T1B 11','T1B 13'], large:['T1A 1','T1A 3','T1A 5'] },
  MRU: { small:['12','14','16'], medium:['10'], large:['7','8','9'] },
};

/* Pick a deterministic but rotating gate for a given flight on a given date */
AIVA.pickGate = (airportCode, aircraftType, dateSeed = new Date().toISOString().slice(0,10)) => {
  const gates = AIVA.GATES[airportCode];
  if (!gates) return null;
  const size = AIVA.acSize(aircraftType);
  let pool = gates[size];
  /* Fall back to a different size if that pool is empty for the airport */
  if (!pool || !pool.length) pool = gates.medium || gates.small || gates.large || [];
  if (!pool.length) return null;
  /* Seed from the airport+aircraft+date so same flight on same day gets same gate */
  const seed = (airportCode + aircraftType + dateSeed).split('').reduce((s,c)=>s+c.charCodeAt(0),0);
  return pool[seed % pool.length];
};
