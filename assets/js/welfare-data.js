/* =====================================================================
   AIVA · Crew Welfare / Bylaws / Layover content
   Loaded before portal.js. Provides static content for:
     - AIVA.LAYOVER_TIPS:    things-to-do per city we operate to
     - AIVA.BYLAWS_SECTIONS: virtual airline rules / chain of command
     - AIVA.WELFARE_FAQ:     common questions answered
     - AIVA.PAX_NAMES:       cultural name pools for the pax manifest
   ===================================================================== */

window.AIVA = window.AIVA || {};

/* ---------- LAYOVER TIPS — per destination IATA ---------- */
AIVA.LAYOVER_TIPS = {
  /* India hubs */
  BOM: { city:'Mumbai', area:'India', hotelArea:'Sahar / Andheri', commute:'25 min to Marine Drive',
         see:['Gateway of India + Taj Mahal Palace at golden hour','Bandra-Worli Sea Link skyline','Elephanta Caves ferry from Apollo Bunder'],
         eat:['Britannia & Co. (Parsi berry pulao)','Bademiya late-night kebabs at Colaba','Trishna seafood (Fort)'],
         buy:['Crawford Market spices','Linking Road fashion'] },
  DEL: { city:'Delhi', area:'India', hotelArea:'Aerocity', commute:'20 min Metro to CP',
         see:['Humayun\'s Tomb + Lodhi Gardens walk','Old Delhi rickshaw + Chandni Chowk','Qutub Minar at sunset'],
         eat:['Karim\'s mutton korma (Jama Masjid)','Indian Accent (modern Indian)','Bukhara at ITC Maurya'],
         buy:['Dilli Haat handicrafts','Janpath market'] },
  BLR: { city:'Bengaluru', area:'India', hotelArea:'Devanahalli',  commute:'45 min to MG Road',
         see:['Lalbagh Botanical Garden glasshouse','UB City + Indiranagar microbreweries','Cubbon Park morning walk'],
         eat:['MTR (rava idli)','Toit brewery','Karavalli (Gateway Hotel) coastal Indian'],
         buy:['Commercial Street','Phoenix Marketcity'] },
  CCU: { city:'Kolkata', area:'India', hotelArea:'New Town', commute:'40 min to Park Street',
         see:['Victoria Memorial','Howrah Bridge at dusk','South Park Street Cemetery'],
         eat:['Peter Cat (Chelo Kebab)','Flurys morning tea','Mocambo continental'],
         buy:['New Market','College Street books'] },
  HYD: { city:'Hyderabad', area:'India', hotelArea:'HICC / Hi-Tec City', commute:'30 min to Charminar',
         see:['Charminar + Laad Bazaar bangles','Golconda Fort sound-and-light','Hussain Sagar lake'],
         eat:['Paradise Biryani','Bawarchi (RTC X Roads)','Shah Ghouse (Tolichowki)'],
         buy:['Laad Bazaar pearls','Sultan Bazaar'] },
  MAA: { city:'Chennai', area:'India', hotelArea:'Meenambakkam', commute:'40 min to Marina',
         see:['Marina Beach at dawn','Kapaleeshwarar Temple, Mylapore','Mahabalipuram day trip'],
         eat:['Murugan Idli Shop','Saravana Bhavan','Annalakshmi (sattvic)'],
         buy:['T. Nagar (Pothys, Nalli sarees)','Spencer Plaza'] },

  /* Europe */
  LHR: { city:'London', area:'UK', hotelArea:'Heathrow T4 / Hayes', commute:'15 min Piccadilly Line to South Ken',
         see:['British Museum (free)','Borough Market + Tate Modern walk','West End evening show'],
         eat:['Dishoom (Indian-Bombay café)','St. JOHN (St. John\'s Square)','Padella (handmade pasta)'],
         buy:['Liberty London','Selfridges','Spitalfields Market Sunday'] },
  LGW: { city:'London Gatwick', area:'UK', hotelArea:'North Terminal', commute:'30 min Gatwick Express to Victoria',
         see:['Brighton seafront day trip (30 min by train)','Kew Gardens (45 min)','Tower of London'],
         eat:['Same as LHR — Soho district 50 min by Express+Tube'],
         buy:['Westfield London','Camden Market weekend'] },
  CDG: { city:'Paris', area:'France', hotelArea:'Roissy', commute:'40 min RER B to Châtelet',
         see:['Louvre Tuesday late evening','Montmartre / Sacré-Cœur sunset','Seine bateaux at dusk'],
         eat:['Bistrot Paul Bert','L\'As du Fallafel (Marais)','Du Pain et des Idées bakery'],
         buy:['Le Bon Marché','Galeries Lafayette','rue de Rivoli'] },
  FRA: { city:'Frankfurt', area:'Germany', hotelArea:'Airport hotel zone', commute:'15 min S-Bahn to Hauptbahnhof',
         see:['Römerberg square','Städel Museum','Sachsenhausen apple-wine taverns'],
         eat:['Adolf Wagner (Apfelwein + Handkäs)','Higmat (Levantine)','Klosterhof'],
         buy:['Zeil shopping street','MyZeil mall'] },
  AMS: { city:'Amsterdam', area:'Netherlands', hotelArea:'Schiphol', commute:'15 min train to Centraal',
         see:['Rijksmuseum + Vondelpark','Jordaan canal walk','Anne Frank House (book ahead)'],
         eat:['Restaurant Greetje (Dutch)','Foodhallen','De Plantage'],
         buy:['9 Streets (De 9 Straatjes)','Albert Cuyp Market'] },
  MXP: { city:'Milan', area:'Italy', hotelArea:'Malpensa', commute:'40 min Malpensa Express to Cadorna',
         see:['Duomo rooftop','Brera district aperitivo','Last Supper (book weeks ahead)'],
         eat:['Trattoria Milanese','Luini (panzerotti)','Marchesi 1824'],
         buy:['Quadrilatero della Moda','Galleria Vittorio Emanuele'] },
  FCO: { city:'Rome', area:'Italy', hotelArea:'Fiumicino', commute:'30 min Leonardo Express to Termini',
         see:['Pantheon + Trevi at night','Colosseum + Roman Forum','Trastevere walk'],
         eat:['Roscioli','Pizzeria Da Remo','Tonnarello Trastevere'],
         buy:['Via del Corso','Campo de\' Fiori market'] },
  VIE: { city:'Vienna', area:'Austria', hotelArea:'Airport hotel zone', commute:'16 min CAT to Wien Mitte',
         see:['Schönbrunn Palace','Belvedere (Klimt\'s Kiss)','Naschmarkt Saturday brunch'],
         eat:['Plachutta (Tafelspitz)','Café Central','Figlmüller schnitzel'],
         buy:['Kärntner Straße','Mariahilfer Straße'] },

  /* North America */
  JFK: { city:'New York (JFK)', area:'USA', hotelArea:'TWA Hotel / Jamaica', commute:'45 min AirTrain+Subway to Midtown',
         see:['Top of the Rock at sunset','High Line + Hudson Yards','MoMA (free Fri evenings)'],
         eat:['Katz\'s Deli pastrami','Joe\'s Pizza (Carmine St)','Sushi Yasaka'],
         buy:['5th Ave','Strand Bookstore','Brooklyn Flea weekend'] },
  EWR: { city:'New York (EWR)', area:'USA', hotelArea:'Newark airport hotels', commute:'25 min NJ Transit to Penn Station NYC',
         see:['Same Manhattan options as JFK','Liberty State Park views of skyline','Hoboken waterfront'],
         eat:['Halal Guys (Midtown)','Lombardi\'s (oldest pizzeria)'],
         buy:['SoHo','Bryant Park Holiday Shops (seasonal)'] },
  SFO: { city:'San Francisco', area:'USA', hotelArea:'Burlingame / SFO', commute:'25 min BART to Embarcadero',
         see:['Golden Gate Bridge cycling (Sausalito ferry back)','Mission District murals','Alcatraz tour (book early)'],
         eat:['Tartine (bread)','Mission Chinese','Zuni Café roast chicken'],
         buy:['Ferry Building Marketplace','Hayes Valley boutiques'] },
  ORD: { city:'Chicago', area:'USA', hotelArea:'O\'Hare area', commute:'40 min Blue Line to Loop',
         see:['Art Institute of Chicago','Millennium Park (Cloud Gate)','Architecture river cruise'],
         eat:['Lou Malnati\'s deep dish','Au Cheval burger','Girl & the Goat'],
         buy:['Magnificent Mile','State Street'] },
  YYZ: { city:'Toronto', area:'Canada', hotelArea:'Pearson area', commute:'25 min UP Express to Union',
         see:['CN Tower EdgeWalk','Distillery District + St. Lawrence Market','Toronto Islands ferry'],
         eat:['Lee Restaurant','Schwartz\'s smoked meat (in nearby Montreal)','Pai (Thai)'],
         buy:['Eaton Centre','Queen Street West'] },
  YVR: { city:'Vancouver', area:'Canada', hotelArea:'Richmond / Sea Island', commute:'25 min Canada Line to Waterfront',
         see:['Stanley Park seawall cycle','Granville Island market','Capilano Suspension Bridge'],
         eat:['Vij\'s (Indian)','Miku (Aburi sushi)','Phnom Penh'],
         buy:['Robson Street','Granville Island'] },

  /* Australia */
  SYD: { city:'Sydney', area:'Australia', hotelArea:'Mascot', commute:'15 min train to Central',
         see:['Opera House + Harbour Bridge climb','Bondi to Coogee coastal walk','Royal Botanic Garden'],
         eat:['Quay (Bennelong tasting menu)','Mr. Wong','Bourke Street Bakery'],
         buy:['Queen Victoria Building (QVB)','Paddington Markets Saturday'] },
  MEL: { city:'Melbourne', area:'Australia', hotelArea:'Tullamarine', commute:'25 min SkyBus to Southern Cross',
         see:['Hosier Lane street art','St. Kilda beach + Acland Street','Great Ocean Road day trip'],
         eat:['Chin Chin','Lune Croissanterie (queue early)','Cumulus Inc.'],
         buy:['Queen Victoria Market','Chapel Street'] },

  /* East / SE Asia */
  HND: { city:'Tokyo (Haneda)', area:'Japan', hotelArea:'On-airport / Otorii', commute:'20 min monorail to Hamamatsucho',
         see:['Shibuya scramble + Hachiko','Senso-ji temple Asakusa','Tsukiji outer market'],
         eat:['Sushi Saito (if reserved months ahead)','Tonkatsu Maisen Aoyama','Ichiran ramen'],
         buy:['Ginza','Don Quijote Akihabara'] },
  NRT: { city:'Tokyo (Narita)', area:'Japan', hotelArea:'Narita town', commute:'60 min Skyliner to Ueno',
         see:['Narita-san Shinsho-ji temple','Day trip to central Tokyo (1h by Skyliner)'],
         eat:['Eel restaurants on Omote-Sando (Narita)','Sushidai (Tsukiji)'],
         buy:['Aeon Mall Narita','Naritasan Omotesando shops'] },
  SIN: { city:'Singapore', area:'Singapore', hotelArea:'Changi', commute:'20 min MRT to Marina Bay',
         see:['Gardens by the Bay (Supertree Grove)','Marina Bay Sands SkyPark','Sentosa beaches'],
         eat:['Hawker Chan (Michelin chicken rice)','328 Katong Laksa','Newton Food Centre'],
         buy:['Orchard Road','Bugis Street'] },
  HKG: { city:'Hong Kong', area:'Hong Kong', hotelArea:'Chek Lap Kok', commute:'24 min Airport Express to Central',
         see:['Victoria Peak tram','Star Ferry Kowloon-Central at night','Big Buddha (Lantau cable car)'],
         eat:['Tim Ho Wan dim sum','Tai Cheong Bakery egg tarts','Yat Lok roast goose'],
         buy:['Causeway Bay','Mong Kok Ladies Market'] },
  BKK: { city:'Bangkok', area:'Thailand', hotelArea:'Suvarnabhumi', commute:'30 min Airport Rail to Phaya Thai',
         see:['Grand Palace + Wat Pho reclining Buddha','Chao Phraya river cruise','Chatuchak weekend market'],
         eat:['Jay Fai (Michelin street food)','Som Tum Nua','Krua Apsorn'],
         buy:['CentralWorld','MBK Center'] },

  /* Middle East */
  DXB: { city:'Dubai', area:'UAE', hotelArea:'Garhoud / Deira', commute:'15 min Metro to Burj Khalifa',
         see:['Burj Khalifa At The Top','Dubai Mall Fountain show','Gold Souk + Spice Souk in Deira'],
         eat:['Al Ustad Special Kabab','Arabian Tea House (Bastakiya)','Ravi Restaurant'],
         buy:['Dubai Mall','Mall of the Emirates','Spice Souk'] },
  DOH: { city:'Doha', area:'Qatar', hotelArea:'On-airport / West Bay', commute:'20 min to Souq Waqif',
         see:['Souq Waqif evening','Museum of Islamic Art','The Pearl-Qatar marina'],
         eat:['Damasca One (Levantine)','Al Mourjan','Saffron Lounge at Katara'],
         buy:['Villaggio Mall','Souq Waqif'] },
  JED: { city:'Jeddah', area:'Saudi Arabia', hotelArea:'Airport hotels', commute:'20 min to Corniche',
         see:['Al-Balad UNESCO old town','King Fahd Fountain at sunset','Corniche walk'],
         eat:['Al Baik chicken','Twina Buffet','Section B (modern Saudi)'],
         buy:['Mall of Arabia','Red Sea Mall'] },
  RUH: { city:'Riyadh', area:'Saudi Arabia', hotelArea:'Diplomatic Quarter', commute:'30 min to Kingdom Centre',
         see:['Kingdom Centre Sky Bridge','Edge of the World rock formation','Diriyah At-Turaif'],
         eat:['Najd Village (traditional)','Section (contemporary)','Albaik'],
         buy:['Riyadh Front','Olaya Street souks'] },

  /* Africa / Indian Ocean */
  NBO: { city:'Nairobi', area:'Kenya', hotelArea:'Embakasi', commute:'30 min to city centre (off-peak)',
         see:['Nairobi National Park morning game drive','Giraffe Centre + David Sheldrick elephant orphanage','Karen Blixen Museum'],
         eat:['Carnivore restaurant','Talisman (Karen)','Hashmis at City Park'],
         buy:['Maasai Market (Tuesdays Kijabe St)','Westgate Mall'] },
  MRU: { city:'Port Louis', area:'Mauritius', hotelArea:'Beachside resorts', commute:'1 h to capital',
         see:['Le Morne UNESCO peninsula','Black River Gorges hike','Trou aux Cerfs crater'],
         eat:['Le Capitaine seafood','Indian-Mauritian dholl puri street stalls'],
         buy:['Caudan Waterfront','Port Louis Central Market'] },
};

/* ---------- BYLAWS ---------- */
AIVA.BYLAWS_SECTIONS = [
  { id:'membership', title:'Membership & Roster',
    body:`AIVA is an invitation-only virtual airline of 14 named pilots. There is no
public sign-up. Membership is granted by the Chief Pilot. Each member is assigned
a permanent Crew ID (e.g. AIV001), rank, and home base. Members are expected to
operate AIVA flights using real Air India / Air India Express callsigns on FS20/24.` },
  { id:'currency', title:'Currency & Competency',
    body:`To remain operationally current, every pilot must log a minimum of **5 hours
of flight time per calendar month** on either Mainline (AIC) or Express (AXB) flights.
The Competency Card is automatically maintained from the Journey Log — sectors logged
in the system count toward currency. A pilot whose currency lapses is placed in
**Currency Hold** and may only operate after a checkride sim session with the Chief Pilot.

A pilot may apply for **Leave Relief** to be exempted from the 5h/month rule (illness,
real-life work travel, personal leave). Approved relief preserves the pilot's seniority
and standing.` },
  { id:'rank',       title:'Rank Ladder',
    body:`Five ranks: Cadet → First Officer → Senior First Officer → Captain → Senior Captain.
Promotions are hour-based (see the Ranks page for thresholds). Senior Captains may
act as Check Airmen — they sign off on type-rating completions and conduct line checks.` },
  { id:'aircraft',   title:'Aircraft Authorisation',
    body:`A pilot may only operate aircraft types listed on their Profile (Type Ratings).
Substitutions within the same family (e.g. A320 ↔ A20N, B787-8 ↔ B789) are permitted
where the simulator add-on supports it; cross-family substitution (e.g. A320 → B777)
is **not** permitted.` },
  { id:'fdtl',       title:'Flight & Duty Time (FDTL)',
    body:`AIVA mirrors DGCA CAR 7-J-III. Maximum flight duty period (FDP) of 14 h
with augmented crew, 13 h without. Rolling 28-day limit: 100 flight hours. Pilots
self-monitor via the FDTL Tracker page; the system warns at 90% of any cap.` },
  { id:'conduct',    title:'Network Conduct',
    body:`When flying on **VATSIM** / **IVAO**: full radio discipline, ATC orders are
absolute, no SELCAL spam. Hoppie CPDLC: a polite, professional tone. Disruptive
behaviour on the live networks reflects on the airline and may result in suspension.` },
  { id:'chain',      title:'Chain of Command',
    body:`Day-to-day operational concerns → **Chief Pilot** (currently the Captain at AIV001).
Welfare / scheduling / leave → **HR Cell** (contact via the Welfare page).
Safety reports → submit anonymously through the EFB ACARS as a Safety Report (SR-);
the Chief Pilot reviews and de-identifies before circulating learnings.` },
  { id:'discipline', title:'Discipline & Appeal',
    body:`Three-strike system: verbal warning (logged) → written warning (filed to profile)
→ suspension review. Any disciplinary action may be appealed in writing to the
Chief Pilot; the appeal is heard by two Senior Captains not involved in the original
decision.` },
  { id:'data',       title:'Data, Privacy & Logs',
    body:`All flight data is stored **locally** in your browser (per-pilot namespaced
localStorage). AIVA does not transmit personal data to any server. Journey-log
exports (CSV / JSON) are at the pilot's discretion.` },
];

/* ---------- WELFARE FAQ ---------- */
AIVA.WELFARE_FAQ = [
  { q:'How do I stay current?',
    a:'Log at least 5 flight hours per calendar month on AIC or AXB sectors. The Competency Card tracks this for you. Sectors completed in the simulator and added to the Journey Log count automatically.' },
  { q:'What happens if I miss the 5h target?',
    a:'You\'re placed in Currency Hold. Submit a Leave Relief request to retroactively exempt the month, or schedule a 45-min refresher with the Chief Pilot before your next live-network flight.' },
  { q:'Who do I contact for scheduling issues?',
    a:'Open a ticket via the Crew Welfare page → Report Operational Concern. The HR Cell triages within 48 hours. Urgent matters → Hoppie CPDLC ADMIN with subject "URGENT".' },
  { q:'Can I swap a roster sector with another pilot?',
    a:'Yes. Both pilots message the Chief Pilot via Hoppie ACARS. Once acknowledged, both update their personal roster (Clear day → Re-book on the other pilot\'s leg).' },
  { q:'How is my pay calculated?',
    a:'Pay is calculated from the Pay Grid for your rank × flight hours logged in the month. Long-haul (>9h block) sectors receive an additional flat sector payment. See the Payslip page for the current month\'s running total.' },
  { q:'Is layover allowance real money?',
    a:'No — AIVA is a virtual airline; all "pay" figures are nominal and exist only for immersion. They mirror real published Air India crew pay structures so that the simulation feels authentic.' },
  { q:'What if I disagree with a discipline action?',
    a:'Submit a written appeal to the Chief Pilot. Two Senior Captains who were not involved in the original decision will hear the appeal and rule within 7 days.' },
  { q:'Can I fly aircraft I\'m not rated on?',
    a:'No. Type ratings are tracked on your Profile. If you complete a real (sim-based) type rating outside of AIVA, message the Chief Pilot with evidence to have the rating added.' },
  { q:'How do I submit a Safety Report?',
    a:'Use the EFB → ACARS → Type SR- followed by your text. The Chief Pilot de-identifies and circulates lessons learned. All SR-prefixed reports are confidential.' },
  { q:'I had a CTD / crash mid-sector. Does it count?',
    a:'Submit a Crash Report via the Admin Review Queue with a screenshot. Sectors that crashed past T/O roll typically count at the discretion of the reviewing officer.' },
];

/* ---------- PAX NAMES — for the EFB manifest tile ---------- */
AIVA.PAX_NAMES = {
  /* Indian — used as the base for every flight */
  india: {
    first: ['Aarav','Aanya','Aditya','Aishwarya','Akhil','Aman','Ananya','Anika','Anil','Anjali','Arjun','Arnav','Ashok','Asha','Bharat','Bhavna','Chetan','Deepak','Deepika','Devika','Dhruv','Diya','Esha','Farah','Gaurav','Geeta','Harish','Hema','Indira','Ishaan','Jagdish','Jasmine','Jay','Kabir','Kamal','Karan','Karthik','Kavya','Kiran','Krishna','Lakshmi','Madhav','Maya','Meera','Mohan','Naina','Nakul','Navya','Neha','Nikhil','Nisha','Niharika','Om','Parth','Pooja','Pranav','Priya','Priyanka','Rahul','Raj','Rajesh','Rakesh','Ramesh','Reema','Riya','Rohan','Rohit','Ruchi','Sahil','Sandeep','Sanjay','Sara','Sarita','Shankar','Shanti','Sheela','Shivani','Siddharth','Simran','Sneha','Sonia','Subhash','Sumit','Sunita','Suresh','Swati','Tanvi','Tara','Uday','Vandana','Varun','Vasant','Vidya','Vijay','Vikram','Vinay','Vivek','Yash','Zara'],
    last:  ['Sharma','Patel','Mehta','Iyer','Reddy','Kumar','Singh','Verma','Kapoor','Khanna','Joshi','Trivedi','Bhatia','Gupta','Aggarwal','Agarwal','Malhotra','Chopra','Saxena','Bhatt','Bose','Banerjee','Chatterjee','Mukherjee','Ghosh','Sen','Das','Roy','Pillai','Nair','Menon','Rao','Krishnan','Subramaniam','Iyengar','Naidu','Shetty','Hegde','Bhat','Pai','Kamath','Desai','Joshi','Pandey','Shukla','Mishra','Tiwari','Yadav','Choudhary','Chaudhry']
  },
  uk:        { first:['Oliver','George','Harry','Jack','William','Charlie','Thomas','James','Henry','Mason','Emma','Olivia','Amelia','Isla','Ava','Mia','Lily','Sophia','Grace','Charlotte','Daniel','Edward','Jacob','Lucas','Logan'], last:['Smith','Jones','Brown','Williams','Taylor','Davies','Evans','Wilson','Thomas','Roberts','Walker','Wright','Robinson','Clark','Hall','White','Hughes','Wood','Lewis','Green'] },
  usa:       { first:['Liam','Noah','Jackson','Aiden','Elijah','Lucas','Logan','Caleb','Connor','Benjamin','Emma','Olivia','Sophia','Ava','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn'], last:['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee'] },
  canada:    { first:['Liam','Noah','Lucas','William','Benjamin','Logan','Olivier','Théo','Charlotte','Emma','Olivia','Léa','Sophia','Florence','Ava'], last:['Tremblay','Roy','Côté','Bouchard','Gagnon','Smith','Brown','Wilson','Lee','Singh','Chan','Dubois','Lavoie','Morin'] },
  france:    { first:['Lucas','Hugo','Léo','Louis','Raphaël','Gabriel','Arthur','Adam','Maël','Jules','Emma','Léa','Manon','Inès','Chloé','Camille','Sarah','Anna','Louise','Alice'], last:['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','Fontaine','Lefevre','Mercier','Bonnet','Rousseau'] },
  germany:   { first:['Maximilian','Alexander','Paul','Leon','Lukas','Felix','Jonas','Noah','Elias','Finn','Sophie','Marie','Emma','Mia','Hannah','Lina','Anna','Lea','Lara','Emilia'], last:['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann'] },
  italy:     { first:['Leonardo','Francesco','Lorenzo','Alessandro','Andrea','Mattia','Gabriele','Tommaso','Riccardo','Edoardo','Sofia','Giulia','Aurora','Alice','Ginevra','Emma','Giorgia','Greta','Vittoria','Beatrice'], last:['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti'] },
  netherlands:{first:['Daan','Sem','Lucas','Levi','Finn','Luuk','Bram','Milan','Tim','Jens','Emma','Julia','Mila','Tess','Sara','Lotte','Anna','Eva','Olivia','Lieke'], last:['de Jong','Jansen','de Vries','van den Berg','van Dijk','Bakker','Janssen','Visser','Smit','Meijer','de Boer','Mulder','de Groot','Bos','Vos','Peters','Hendriks','van Leeuwen','Dekker','Brouwer'] },
  austria:   { first:['Maximilian','Felix','Lukas','Tobias','David','Sebastian','Anna','Hannah','Lena','Sophie','Lara'], last:['Gruber','Huber','Bauer','Wagner','Müller','Pichler','Steiner','Moser','Mayer','Hofer'] },
  uae:       { first:['Mohammed','Ahmad','Hassan','Khalid','Saeed','Abdul','Yousef','Omar','Fatima','Aisha','Maryam','Layla','Noora','Hessa','Mariam'], last:['Al Maktoum','Al Nahyan','Al Qasimi','Al Mansoori','Al Falasi','Al Hashemi','Al Mazrouei','Al Awadhi','Al Marri','Al Shamsi'] },
  qatar:     { first:['Mohammed','Ahmed','Hassan','Khalid','Abdullah','Fatima','Maryam','Aisha','Nora','Hind'], last:['Al Thani','Al Kuwari','Al Attiyah','Al Mannai','Al Maadeed','Al Misnad','Al Khater','Al Sulaiti'] },
  saudi:     { first:['Abdullah','Mohammed','Fahad','Saud','Khalid','Bandar','Norah','Reem','Sara','Lulu','Aljohara'], last:['Al Saud','Al Rashid','Al Otaibi','Al Qahtani','Al Ghamdi','Al Harbi','Al Sulami','Al Mutairi','Al Dossari','Al Anazi'] },
  oman:      { first:['Sultan','Said','Ali','Hamad','Salim','Mona','Asma','Buthaina','Hanan','Rashid'], last:['Al Said','Al Habsi','Al Hinai','Al Riyami','Al Balushi','Al Mahrouqi','Al Yahyai','Al Lawati'] },
  bahrain:   { first:['Ahmed','Salman','Khalifa','Abdullah','Hamad','Layla','Mariam','Nour','Sara'], last:['Al Khalifa','Al Zayani','Al Mahmood','Al Doseri','Al Khaja','Al Awadhi'] },
  kuwait:    { first:['Mishaal','Sabah','Jaber','Nawaf','Fahd','Dalal','Sheikha','Mona','Maha'], last:['Al Sabah','Al Saud','Al Mutairi','Al Ajmi','Al Rashidi','Al Dosari'] },

  japan:     { first:['Hiroshi','Takashi','Yuki','Kenji','Daisuke','Akira','Haruto','Souta','Ren','Yuto','Sakura','Yui','Hina','Hana','Aoi','Akari','Mei','Rin','Misaki','Yuna'], last:['Sato','Suzuki','Takahashi','Tanaka','Watanabe','Ito','Yamamoto','Nakamura','Kobayashi','Saito','Kato','Yoshida','Yamada','Sasaki','Yamaguchi','Matsumoto','Inoue','Kimura','Hayashi','Shimizu'] },
  korea:     { first:['Min-jun','Seo-jun','Do-yun','Si-woo','Joon-woo','Yu-jin','Ha-eun','Seo-yeon','Min-seo','Ji-woo','Soo-min','Ha-rin'], last:['Kim','Lee','Park','Choi','Jung','Kang','Cho','Yoon','Jang','Lim','Han','Oh','Seo','Shin','Kwon','Hwang'] },
  china:     { first:['Wei','Lei','Yong','Tao','Hao','Jun','Ling','Mei','Hua','Fang','Yan','Min','Hong','Xue','Yue','Jing','Xiao'], last:['Wang','Li','Zhang','Liu','Chen','Yang','Huang','Zhao','Wu','Zhou','Xu','Sun','Ma','Zhu','Hu','Lin','Guo','He','Gao','Liang'] },
  singapore: { first:['Wei Ming','Jun Hao','Zheng Xian','Si Hui','Xin Yi','Hui Min','Aravind','Priya','Siti','Nur','Aisha','Hafiz','Faiz'], last:['Tan','Lim','Lee','Ng','Wong','Goh','Ong','Chua','Teo','Koh','Yeo','Sim','Loh','Chong'] },
  thailand:  { first:['Somchai','Anuwat','Chai','Niran','Boon','Apinya','Malee','Suda','Ploy','Pim','Ananda','Kanya'], last:['Saetang','Wong','Phromma','Suwan','Chai','Boonsong','Saetan','Phong','Srisuwan','Thongchai'] },
  hongkong:  { first:['Wai','Ka','Hin','Chun','Ho','Ming','Wing','Lai','Mei','Yan','Yee','Suk'], last:['Chan','Wong','Cheung','Chow','Lee','Lau','Ng','Yip','Leung','Lam','Tang','Ho'] },
  australia: { first:['Oliver','Liam','Noah','Jack','Henry','William','Ethan','Charlotte','Olivia','Amelia','Ava','Mia','Sophia','Isla','Ruby'], last:['Smith','Jones','Williams','Brown','Wilson','Taylor','Johnson','White','Anderson','Thompson','Lee','Walker','Hall','Allen','Young','King','Wright'] },
  kenya:     { first:['Brian','Kevin','Dennis','Daniel','Joseph','James','Grace','Mary','Faith','Sarah','Joyce','Ruth','Esther'], last:['Mwangi','Kamau','Wanjiku','Otieno','Onyango','Achieng','Kiprop','Cheruiyot','Wambui','Njoroge','Mutua','Kariuki'] },
  mauritius: { first:['Jean','Pierre','Marie','Claudine','Sandrine','Raj','Devi','Yashvir','Anjali'], last:['Ramdin','Beeharry','Bhugun','Seetohul','Lutchmun','Ramyead','Mohun','Jhuboo','Bhaukaurally'] },
};

/* =====================================================================
   AIVA.SITUATIONS — 30+ non-technical in-flight scenarios.

   Each scenario has:
     id              short identifier
     cat             cabin | world | company | medical | security | weather | ops
     title           short header for the EFB
     summary         one-line summary
     acars           ACARS template — what dispatch reports when situation fires
     cpdlc           CPDLC template — only used if datalink is connected
     diversion       'expected' | 'likely' | 'possible' | 'no'
     ack             'mandatory' | 'optional' — does dispatch expect an ack?
     baseProb        baseline probability 0-1 of this firing in any given flight.
                     The pilot's "world events" slider multiplies this.

   When a flight is active, on FSUIPC heartbeat the EFB rolls per-second dice
   weighted by baseProb × slider value. If it lands on a scenario, it's
   triggered: shown in EFB, ACARS message auto-sent, and (if CPDLC connected)
   the CPDLC line is uplinked too.
   ===================================================================== */
AIVA.SITUATIONS = [
  /* ===== CABIN ===== */
  { id:'pax_unruly',     cat:'cabin',    title:'Unruly passenger',           summary:'Inebriated pax in 38C refusing to comply with cabin crew.',                       acars:'CC reporting unruly pax 38C. Restraint kit deployed.',                     cpdlc:'REQUEST PRIORITY ARRIVAL — UNRULY PAX', diversion:'no',       ack:'optional',  baseProb:0.08 },
  { id:'pax_medical',    cat:'cabin',    title:'Medical event onboard',       summary:'58yo male pax — chest pain, breathing laboured. Doctor onboard responding.',     acars:'MEDICAL EVENT — 58M chest pain — doctor onboard. Awaiting MEDA support.',  cpdlc:'PAN PAN — MEDICAL DIVERSION REQUEST',   diversion:'expected', ack:'mandatory', baseProb:0.04 },
  { id:'pax_lavatory_smoke', cat:'cabin', title:'Smoke alarm — fwd lav',      summary:'Smoke detector in forward lav triggered. CC investigating.',                      acars:'SMK DET FWD LAV — investigating. No active smoke confirmed yet.',           cpdlc:'STANDBY',                                diversion:'possible', ack:'optional',  baseProb:0.03 },
  { id:'pax_child',      cat:'cabin',    title:'Distressed child / UMNR',      summary:'Unaccompanied minor in 22D unwell, vomiting.',                                    acars:'UMNR ill — 22D, vomiting. CC managing.',                                    cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.05 },
  { id:'pax_belt',       cat:'cabin',    title:'Pax injured during turb',      summary:'Pax in 41B hit head on ceiling during light turbulence.',                         acars:'PAX INJURED 41B during turb — no LOC, observation.',                        cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.04 },
  { id:'pax_birth',      cat:'cabin',    title:'In-flight birth',              summary:'30wk pregnant pax in labour — onboard doctor + CC managing.',                     acars:'IN-FLIGHT BIRTH IMMINENT — 30wk gest. Doctor + CC managing.',               cpdlc:'PAN PAN — MEDICAL — IMMINENT BIRTH',    diversion:'expected', ack:'mandatory', baseProb:0.01 },
  { id:'pax_lost_item',  cat:'cabin',    title:'Pax lost passport',            summary:'Premium pax in 4A misplaced passport — search underway.',                          acars:'PAX 4A lost passport — search ongoing.',                                    cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.06 },
  { id:'cc_short',       cat:'cabin',    title:'CC short — one ill',           summary:'L2 cabin crew member ill — crew complement now 7 of 8.',                           acars:'CC L2 ill — crew now 7/8. Service modified.',                                cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.04 },
  { id:'galley_fault',   cat:'cabin',    title:'Galley oven inop',             summary:'Aft galley oven 2 reported inop. Service plan adjusted.',                          acars:'AFT GALLEY OVEN 2 INOP — service modified.',                                cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.07 },
  { id:'pax_drunk',      cat:'cabin',    title:'Intoxicated pax refused alcohol', summary:'Pax in 24J visibly intoxicated, refused further service.',                       acars:'PAX 24J refused further alcohol service — verbally hostile.',               cpdlc:'',                                       diversion:'no',       ack:'optional',  baseProb:0.06 },

  /* ===== SECURITY ===== */
  { id:'sec_bomb_threat', cat:'security', title:'Bomb threat — ground call',    summary:'Dispatch received anonymous threat naming this flight. PIC briefed.',              acars:'⚠ SECURITY ALERT — anonymous bomb threat received against this flight. PIC discretion.', cpdlc:'PAN PAN PAN — SECURITY THREAT', diversion:'likely',   ack:'mandatory', baseProb:0.005 },
  { id:'sec_pax_aggressive', cat:'security', title:'Pax aggression — interference', summary:'Pax in 11A attempting to enter cockpit door area — restrained.',                   acars:'⚠ SECURITY — pax 11A attempting cockpit entry — restrained.',                cpdlc:'PAN PAN — SECURITY',                  diversion:'likely',   ack:'mandatory', baseProb:0.008 },
  { id:'sec_drone',       cat:'security', title:'Drone sighting near approach',  summary:'TWR reports drone observed 4nm final RWY 27R.',                                    acars:'DRONE SIGHTING reported 4nm final RWY 27R at destination.',                  cpdlc:'',                                  diversion:'possible', ack:'mandatory', baseProb:0.01 },

  /* ===== MEDICAL / CREW ===== */
  { id:'pic_incap',       cat:'medical', title:'PIC partial incapacitation',     summary:'Captain reports severe migraine + visual aura. F/O assumes control.',              acars:'⚠ PIC partial incap — F/O has control. Sector continuing.',                   cpdlc:'',                                  diversion:'possible', ack:'mandatory', baseProb:0.005 },
  { id:'crew_food_pois',  cat:'medical', title:'Crew food poisoning suspected',  summary:'Both pilots ate the same meal. F/O reports nausea — PIC unaffected so far.',       acars:'CREW FOOD POIS suspected — F/O nauseous. PIC monitoring own status.',         cpdlc:'',                                  diversion:'possible', ack:'mandatory', baseProb:0.003 },

  /* ===== WORLD / GEOPOLITICAL ===== */
  { id:'world_airspace', cat:'world',    title:'Airspace closure enroute',       summary:'NOTAM raised for FIR XX — overflight prohibited for next 2 hours.',                acars:'AIRSPACE CLOSURE in FIR — reroute being computed.',                          cpdlc:'EXPECT REROUTE',                    diversion:'no',       ack:'mandatory', baseProb:0.02 },
  { id:'world_volcano',  cat:'world',    title:'Volcanic ash forecast',          summary:'VAAC issued advisory — ash cloud expected on planned routing.',                    acars:'VOLCANIC ASH forecast on routing. Recompute filed.',                          cpdlc:'EXPECT REROUTE',                    diversion:'possible', ack:'mandatory', baseProb:0.005 },
  { id:'world_geomag',   cat:'world',    title:'Geomagnetic storm — HF degraded',summary:'Solar storm in progress. HF coverage degraded over polar route.',                  acars:'GEOMAG STORM — HF coverage degraded. CPDLC primary.',                         cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.01 },
  { id:'world_gnd_stop', cat:'world',    title:'Destination ground stop',        summary:'Destination ATC ground-stopped for 90 min due to runway incident.',                 acars:'DEST GROUND STOP 90 min — runway incident. Hold or divert.',                  cpdlc:'EXPECT HOLD OR DIVERSION',         diversion:'likely',   ack:'mandatory', baseProb:0.015 },
  { id:'world_curfew',   cat:'world',    title:'Approaching curfew window',      summary:'Destination has 23:00–06:00 curfew. Delay may push us into window.',                acars:'CURFEW alert — ETA approaches curfew. Coordinate priority.',                 cpdlc:'REQUEST PRIORITY',                   diversion:'possible', ack:'optional',  baseProb:0.02 },

  /* ===== COMPANY ===== */
  { id:'co_swap',        cat:'company',  title:'Aircraft swap requested',        summary:'OCC requests gate swap on arrival — original aircraft now operating different sector.', acars:'OCC: A/C swap on arrival. Continue as filed.',                                cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.04 },
  { id:'co_vip',         cat:'company',  title:'VIP / Code 1 on board',          summary:'OCC notes VIP pax in 1A — priority handling on arrival.',                          acars:'VIP CODE 1 onboard 1A. Priority handling at gate.',                           cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.05 },
  { id:'co_minconn',     cat:'company',  title:'Minimum connection pax',         summary:'24 pax with sub-30min connection at destination. Priority deplane.',               acars:'24 MINCONN pax — priority deplane requested at gate.',                       cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.08 },
  { id:'co_dx_change',   cat:'company',  title:'Last-minute SLOT change',        summary:'Network ops requesting +15min ground hold for crew connection at destination.',     acars:'SLOT +15 requested for downline crew connection.',                            cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.06 },
  { id:'co_press',       cat:'company',  title:'Media on board',                 summary:'Aviation press pax in 3A — corp comms aware.',                                     acars:'MEDIA pax 3A — corp comms briefed.',                                          cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.02 },

  /* ===== OPS / TECHNICAL (non-emergency) ===== */
  { id:'ops_mel',        cat:'ops',      title:'New MEL item raised',            summary:'Maintenance raised an MEL item ground-side post-departure. Review required.',     acars:'MEL item raised post-dep — review NOTOC.',                                    cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.04 },
  { id:'ops_birds',      cat:'ops',      title:'Bird strike on T/O',             summary:'F/O reports bird strike on rotation. No engine indications abnormal.',              acars:'BIRD STRIKE on T/O — engines nominal — visual inspection on arrival.',         cpdlc:'',                                  diversion:'no',       ack:'mandatory', baseProb:0.02 },
  { id:'ops_lightning',  cat:'ops',      title:'Lightning strike in cruise',     summary:'Suspected lightning strike — no caution lights. Inspection on arrival.',           acars:'SUSPECT LIGHTNING STRIKE — no warnings. Maintenance inspection on arrival.',  cpdlc:'',                                  diversion:'no',       ack:'mandatory', baseProb:0.015 },
  { id:'ops_fuel_pi',    cat:'ops',      title:'Performance index drift',        summary:'EPR / N1 indications drifting +1.5%. Trending — not actionable yet.',               acars:'PERF DRIFT noted — trend monitoring.',                                        cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.03 },

  /* ===== WEATHER ===== */
  { id:'wx_tafdest',     cat:'weather',  title:'Destination TAF deteriorating',  summary:'New TAF — destination ceiling forecast BKN005 with visibility 1500m.',              acars:'TAF DETERIORATING at dest — BKN005 1500m. Verify alt.',                       cpdlc:'EXPECT HOLD OR DIVERSION',         diversion:'likely',   ack:'mandatory', baseProb:0.03 },
  { id:'wx_alt_deteriorating', cat:'weather', title:'Alternate going below mins', summary:'Filed alternate now reporting below CAT I mins.',                                    acars:'ALT below mins — second alt being recomputed.',                              cpdlc:'STANDBY ALTERNATE',                  diversion:'no',       ack:'mandatory', baseProb:0.02 },
  { id:'wx_turbulence',  cat:'weather',  title:'Severe turbulence reported',     summary:'PIREP — severe turb FL340 abeam BBB.',                                              acars:'SEV TURB PIREP FL340. Recommend FL360 or FL320.',                             cpdlc:'REQUEST LEVEL CHANGE',              diversion:'no',       ack:'optional',  baseProb:0.04 },

  /* ===== EQUIPMENT FAILURES — minor ===== */
  { id:'eq_radar_inop',  cat:'ops',      title:'WX radar partial fail',          summary:'WX radar left side intermittent. Right side working.',                              acars:'WX RADAR L intermittent. Right side primary.',                                cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.02 },
  { id:'eq_ifr_box',     cat:'ops',      title:'IFE rack down',                  summary:'Cabin entertainment system fully down. No safety impact.',                          acars:'IFE down — cabin comfort impact only.',                                       cpdlc:'',                                  diversion:'no',       ack:'optional',  baseProb:0.08 },
];
