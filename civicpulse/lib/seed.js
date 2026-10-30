// Synthetic demo dataset. All reports, names and locations are fictional.
// Coordinates are jittered around approximate locality centres in Bengaluru.

import { jitter, nearestLocality, TEAM_FOR_CATEGORY, PRIORITY_META } from './geo.js';

const TEAM_LEADS = {
  'Drainage & Stormwater': 'R. Menon',
  'Roads & Potholes': 'S. Kulkarni',
  'Solid Waste Management': 'A. Fernandes',
  'Street Lighting': 'K. Rao',
  'Electrical Safety': 'M. Iyer',
  'Water Supply': 'P. Shetty',
  'Public Property & Parks': 'N. Bhat',
  'Emergency Response': 'Control room',
};

const SPECS = [
  // ---------------- Ejipura hotspot (dense, multi-category) ----------------
  { key: 'ej-water-1', cat: 'Waterlogging', locality: 'Ejipura', offset: 35, days: 0.28, status: 'new', confirmations: 4,
    text: 'Knee-deep water at Ejipura signal after last night rain. Bikes are stalling and traffic is backed up for 500 metres.' },
  { key: 'ej-water-2', cat: 'Waterlogging', locality: 'Ejipura', offset: 55, days: 0.18, status: 'new', confirmations: 6, dupOf: 'ej-water-1',
    text: 'Same waterlogging at Ejipura signal again. Two feet of water and a car is stuck near the bus stop.' },
  { key: 'ej-drain-1', cat: 'Drainage', locality: 'Ejipura', offset: 70, days: 1.2, status: 'review',
    text: 'Storm water drain near Ejipura 5th cross is blocked with silt and plastic. Water is backing up into our compound.' },
  { key: 'ej-drain-2', cat: 'Drainage', locality: 'Ejipura', offset: 95, days: 2.4, status: 'new',
    text: 'Drain overflowing near Ejipura main road. Foul smell for two days and black water on the footpath.' },
  { key: 'ej-road-1', cat: 'Road Damage', locality: 'Ejipura', offset: 80, days: 3.1, status: 'assigned',
    text: 'Road surface near Ejipura signal has broken up after the flooding. Deep potholes and loose tar are hitting two-wheelers.' },
  { key: 'ej-waste-1', cat: 'Waste Overflow', locality: 'Ejipura', offset: 120, days: 4.0, status: 'new',
    text: 'Garbage is piling up at the Ejipura corner for three days. Dogs are pulling waste onto the road and it smells terrible.' },
  { key: 'ej-water-supply', cat: 'Water Supply', locality: 'Ejipura', offset: 60, days: 0.8, status: 'review', confirmations: 3,
    text: 'Tap water in Ejipura is muddy and smells of sewage since yesterday. Two children in our building have fallen sick.' },
  { key: 'ej-shop-flood', cat: 'Waterlogging', locality: 'Ejipura', offset: 45, days: 0.22, status: 'new',
    text: 'Water entered the ground floor shops near Ejipura 5th cross during last night rain. Stock is damaged and owners are bailing it out.' },
  { key: 'ej-manhole', cat: 'Safety Hazard', locality: 'Ejipura', offset: 110, days: 0.55, status: 'new',
    text: 'Open manhole in the middle of Ejipura main road with no barricade. A child almost fell in this morning.' },
  { key: 'ej-drain-resolved', cat: 'Drainage', locality: 'Ejipura', offset: 140, days: 12, status: 'resolved',
    text: 'Drain near Ejipura 3rd cross is choked and not taking water before the monsoon.', resolution: 'Drain desilted and 1.2 tonnes of silt removed by the drainage crew. Verified with a flow test on site.' },

  // ---------------- Koramangala ----------------
  { key: 'kor-pothole-1', cat: 'Road Damage', locality: 'Sony World Signal', offset: 18, days: 5.1, status: 'assigned', confirmations: 2,
    text: 'Deep pothole near Sony World signal. A car tyre got damaged yesterday and bikes are swerving into traffic.' },
  { key: 'kor-pothole-2', cat: 'Road Damage', locality: 'Sony World Signal', offset: 28, days: 4.7, status: 'new', dupOf: 'kor-pothole-1',
    text: 'Same pothole at the Sony World junction is getting bigger. Very hard to see at night.' },
  { key: 'kor-pothole-3', cat: 'Road Damage', locality: 'Koramangala 5th Block', offset: 90, days: 7.2, status: 'in_progress',
    text: 'Large pothole outside Koramangala 5th Block park. Children walking to school have to step onto the road.' },
  { key: 'kor-livewire', cat: 'Safety Hazard', locality: 'Koramangala 6th Block', offset: 40, days: 0.12, status: 'new', confirmations: 7,
    text: 'Live electric wire has fallen on the road near National Public School, Koramangala. It is sparking and people are walking close to it.' },
  { key: 'kor-water-contam', cat: 'Water Supply', locality: 'Koramangala 6th Block', offset: 150, days: 1.8, status: 'review',
    text: 'Drinking water in Koramangala 6th Block is contaminated. Several residents have fallen sick and the water looks yellow.' },
  { key: 'kor-garbage', cat: 'Waste Overflow', locality: 'Koramangala 4th Block', offset: 120, days: 6.8, status: 'assigned',
    text: 'Commercial waste is being dumped in the residential bin near Koramangala 4th Block. The bin is always overflowing.' },
  { key: 'kor-signal-light', cat: 'Streetlight', locality: 'Sony World Signal', offset: 30, days: 8.4, status: 'resolved',
    text: 'Streetlight near Sony World signal is not working. The junction is dark and accident-prone at night.', resolution: 'Lamp head and driver replaced. Light tested on site; timer corrected.' },
  { key: 'kor-tree', cat: 'Safety Hazard', locality: 'Koramangala 5th Block', offset: 200, days: 1.1, status: 'assigned',
    text: 'Tree branch is about to fall on parked cars near the Koramangala 5th Block park after the storm.' },

  // ---------------- HSR Layout ----------------
  { key: 'hsr-waste-1', cat: 'Waste Overflow', locality: 'HSR Layout Sector 2', offset: 30, days: 3.2, status: 'assigned', confirmations: 5,
    text: 'Garbage bin on 27th Main, HSR Sector 2 has been overflowing for three days. Dogs are pulling waste onto the road.' },
  { key: 'hsr-waste-2', cat: 'Waste Overflow', locality: 'HSR Layout Sector 2', offset: 42, days: 2.8, status: 'new', dupOf: 'hsr-waste-1',
    text: 'Bin near 27th Main HSR is still full. Trash is scattered on the footpath and smells terrible.' },
  { key: 'hsr-waste-3', cat: 'Waste Overflow', locality: 'HSR Layout Sector 2', offset: 55, days: 2.2, status: 'new',
    text: 'Nobody has collected waste from 27th Main this week. Bins are full and there are flies everywhere.' },
  { key: 'hsr-blackspot', cat: 'Waste Overflow', locality: 'HSR Layout Sector 2', offset: 160, days: 6.1, status: 'review',
    text: 'Black spot behind HSR Sector 2 market is growing. Vendors are dumping waste there every evening.' },
  { key: 'hsr-dog', cat: 'Safety Hazard', locality: 'HSR Layout Sector 1', offset: 100, days: 5.0, status: 'review',
    text: 'Stray dog pack is attacking people near the HSR Sector 1 school in the morning.' },
  { key: 'hsr-debris', cat: 'Waste Overflow', locality: 'HSR Layout Sector 3', offset: 130, days: 7.4, status: 'assigned',
    text: 'Construction debris dumped on the roadside in HSR Sector 3 is blocking the lane.' },
  { key: 'hsr-light', cat: 'Streetlight', locality: 'HSR Layout Sector 1', offset: 80, days: 9.5, status: 'resolved',
    text: 'Streetlight outside the HSR Sector 1 park is not working, women avoid walking there after dark.', resolution: 'Faulty cable joint repaired and lamp replaced. Lighting verified after 7 pm.' },

  // ---------------- Indiranagar / East ----------------
  { key: 'ind-light-1', cat: 'Streetlight', locality: 'Indiranagar 100ft Road', offset: 25, days: 4.0, status: 'assigned', confirmations: 4,
    text: 'Half the streetlights on Indiranagar 100ft Road are not working. The stretch is dark and unsafe for women walking home.' },
  { key: 'ind-light-2', cat: 'Streetlight', locality: 'Indiranagar 100ft Road', offset: 90, days: 3.5, status: 'new',
    text: 'Streetlight near the Indiranagar 100ft Road bus stop is off since Monday. The pavement is pitch dark.' },
  { key: 'ind-light-3', cat: 'Streetlight', locality: 'Indiranagar 100ft Road', offset: 140, days: 5.5, status: 'review',
    text: 'Two lamps near the 100ft Road junction are flickering and then going off completely.' },
  { key: 'ind-pole', cat: 'Safety Hazard', locality: 'Indiranagar 100ft Road', offset: 110, days: 6.0, status: 'assigned',
    text: 'Streetlight pole damaged in an accident near 100ft Road. Wires are exposed at the base and children walk past it.' },
  { key: 'ind-gas', cat: 'Safety Hazard', locality: 'Indiranagar 100ft Road', offset: 180, days: 0.9, status: 'new',
    text: 'Gas smell near the restaurant on 80ft road Indiranagar, possible leak. Staff and customers are standing outside.' },
  { key: 'ind-encroach', cat: 'Public Property', locality: 'Indiranagar 100ft Road', offset: 210, days: 6.5, status: 'review',
    text: 'Footpath near Indiranagar metro has been encroached by shops. Pedestrians are walking on the road.' },
  { key: 'ind-light-old', cat: 'Streetlight', locality: 'Indiranagar 100ft Road', offset: 300, days: 8.2, status: 'resolved',
    text: 'Streetlight outside house number 214 on 100ft Road has not worked for a week.', resolution: 'Lamp replaced. The feeder pillar was also checked and found healthy.' },

  // ---------------- Silk Board / BTM ----------------
  { key: 'silk-water-1', cat: 'Waterlogging', locality: 'Silk Board', offset: 20, days: 1.5, status: 'assigned', confirmations: 8,
    text: 'Waterlogging under Silk Board flyover. Vehicles are stranded in deep water and the service road is blocked.' },
  { key: 'silk-water-2', cat: 'Waterlogging', locality: 'Silk Board', offset: 45, days: 1.3, status: 'new',
    text: 'Silk Board service road is flooded again. Autos are refusing to go under the flyover.' },
  { key: 'silk-drain', cat: 'Drainage', locality: 'Silk Board', offset: 70, days: 2.0, status: 'new',
    text: 'Drain near Silk Board is choked with plastic. Water is not moving and the smell is awful.' },
  { key: 'btm-crater', cat: 'Road Damage', locality: 'BTM Layout 2nd Stage', offset: 60, days: 6.2, status: 'assigned',
    text: 'Large crater in the middle of the BTM 2nd Stage road. It is very dangerous at night and cars brake suddenly.' },
  { key: 'btm-tanker', cat: 'Water Supply', locality: 'BTM Layout 2nd Stage', offset: 120, days: 5.5, status: 'in_progress',
    text: 'Water tanker has not arrived in BTM for three days. Residents are buying cans and the supply is irregular.' },
  { key: 'btm-sinkhole', cat: 'Road Damage', locality: 'BTM Layout 2nd Stage', offset: 190, days: 2.1, status: 'review',
    text: 'Road caved in near the storm drain in BTM 2nd Stage. It looks like a sinkhole and the edge is crumbling.' },

  // ---------------- Bellandur ----------------
  { key: 'bel-drain-1', cat: 'Drainage', locality: 'Bellandur', offset: 30, days: 3.0, status: 'assigned',
    text: 'Sewage is overflowing from the drain near Bellandur market. Black water is flowing on the footpath.' },
  { key: 'bel-drain-2', cat: 'Drainage', locality: 'Bellandur', offset: 90, days: 2.5, status: 'in_progress',
    text: 'Drain behind the Bellandur apartments is blocked. Waste water is entering the parking area.' },
  { key: 'bel-waste', cat: 'Waste Overflow', locality: 'Bellandur', offset: 120, days: 4.2, status: 'new',
    text: 'Garbage dumped next to the drain in Bellandur. Plastic is choking the inlet and the drain cannot take rain water.' },
  { key: 'bel-light', cat: 'Streetlight', locality: 'Bellandur', offset: 160, days: 13.5, status: 'resolved',
    text: 'Streetlight near the Bellandur bus stop is flickering and then going off at night.', resolution: 'Driver unit replaced; lamp now stays on through the night.' },

  // ---------------- Jayanagar / Central ----------------
  { key: 'jay-water-1', cat: 'Water Supply', locality: 'Jayanagar 4th Block', offset: 40, days: 1.0, status: 'review', confirmations: 2,
    text: 'No water supply in Jayanagar 4th Block since yesterday. The tanker has not arrived and taps are dry.' },
  { key: 'jay-water-2', cat: 'Water Supply', locality: 'Jayanagar 4th Block', offset: 90, days: 2.2, status: 'new',
    text: 'Water pressure is very low in Jayanagar. Upper floors are getting nothing for two days.' },
  { key: 'jay-water-3', cat: 'Water Supply', locality: 'Jayanagar 4th Block', offset: 130, days: 3.0, status: 'assigned',
    text: 'Tap water in Jayanagar is brown after the pipeline repair. It stains clothes and smells metallic.' },
  { key: 'jay-bench', cat: 'Public Property', locality: 'Jayanagar 4th Block', offset: 70, days: 14, status: 'resolved',
    text: 'Park benches in Jayanagar 4th Block park are damaged and unusable.', resolution: 'Six benches repaired and repainted by the parks contractor.' },
  { key: 'wil-sinkhole', cat: 'Road Damage', locality: 'Wilson Garden', offset: 60, days: 2.1, status: 'assigned',
    text: 'Road caved in near the storm drain in Wilson Garden. The edge is crumbling and two-wheelers are falling.' },
  { key: 'wil-burn', cat: 'Waste Overflow', locality: 'Wilson Garden', offset: 110, days: 3.6, status: 'in_progress',
    text: 'Waste is being burned in the open near Wilson Garden market. Smoke is entering homes and children are coughing.' },
  { key: 'wil-debris', cat: 'Waste Overflow', locality: 'Wilson Garden', offset: 180, days: 9, status: 'resolved',
    text: 'Construction debris dumped on the footpath near Wilson Garden is blocking pedestrians.', resolution: 'Debris removed and the site cleared. Warning notice issued to the contractor.' },
  { key: 'domlur-footpath', cat: 'Road Damage', locality: 'Domlur', offset: 70, days: 9.2, status: 'assigned',
    text: 'Footpath tiles broken outside Domlur bus stop. Elderly people and a wheelchair user are tripping.' },
  { key: 'domlur-play', cat: 'Public Property', locality: 'Domlur', offset: 150, days: 9.8, status: 'assigned',
    text: 'Playground equipment in Domlur park is rusted and unsafe for children.' },
  { key: 'domlur-light', cat: 'Streetlight', locality: 'Domlur', offset: 200, days: 10.5, status: 'resolved',
    text: 'New streetlight installed in Domlur but never connected. The pole has no light at night.', resolution: 'Connection completed and the lamp is now on the feeder. Tested for two nights.' },
  { key: 'domlur-excavation', cat: 'Safety Hazard', locality: 'Domlur', offset: 260, days: 2.7, status: 'review',
    text: 'Deep excavation left open at night near Jeevan Bima Nagar main road. No barricade or lights.' },
  { key: 'mg-toilet', cat: 'Public Property', locality: 'MG Road', offset: 50, days: 18, status: 'resolved',
    text: 'Public toilet near MG Road is locked and dirty. Visitors have no facility.', resolution: 'Toilet cleaned, lock repaired and attendant roster restored.' },
  { key: 'mg-pole', cat: 'Streetlight', locality: 'MG Road', offset: 120, days: 4.4, status: 'in_progress',
    text: 'Streetlight pole is leaning after an accident near MG Road. Wires are exposed and the light is out.' },
  { key: 'shanthi-pipe', cat: 'Water Supply', locality: 'Shanthinagar', offset: 60, days: 0.7, status: 'new',
    text: 'Pipeline burst on the main road in Shanthinagar. Water is gushing out and flooding the street.' },
  { key: 'austin-tap', cat: 'Water Supply', locality: 'Austin Town', offset: 80, days: 7.5, status: 'resolved',
    text: 'Public tap broken in Austin Town. Water has been flowing onto the street for two days.', resolution: 'Tap replaced and the leaking line clamped. Street dried and cleaned.' },
  { key: 'richmond-shelter', cat: 'Public Property', locality: 'Richmond Town', offset: 40, days: 12.5, status: 'resolved',
    text: 'Bus stop shelter roof in Richmond Town is broken and leaking. Passengers get wet when it rains.', resolution: 'Roof sheet replaced and frame repainted by the shelters contractor.' },
  { key: 'vivek-waste', cat: 'Waste Overflow', locality: 'Vivek Nagar', offset: 100, days: 8.1, status: 'in_progress',
    text: 'Garbage collection vehicle has not come to Vivek Nagar for four days. Bins are full and waste is on the road.' },
  { key: 'ulsoor-dark', cat: 'Streetlight', locality: 'Ulsoor', offset: 70, days: 2.3, status: 'new',
    text: 'Streetlight near Ulsoor lake walking path is not working. The path is completely dark in the evening.' },
  { key: 'adu-speed', cat: 'Road Damage', locality: 'Adugodi', offset: 90, days: 11, status: 'resolved',
    text: 'Speed breaker near the Adugodi school is broken and has sharp edges.', resolution: 'Speed breaker rebuilt with reflective paint and a warning sign.' },
  { key: 'jeevan-transformer', cat: 'Safety Hazard', locality: 'Jeevan Bima Nagar', offset: 110, days: 3.8, status: 'assigned',
    text: 'Transformer near the Jeevan Bima Nagar bus stop is buzzing loudly and smoking. Residents are worried.' },
  { key: 'cvr-park', cat: 'Public Property', locality: 'CV Raman Nagar', offset: 120, days: 15, status: 'resolved',
    text: 'The community park gate in CV Raman Nagar is broken and stray animals enter at night.', resolution: 'Gate hinge and latch replaced. Park committee informed.' },
];

const PUBLIC_UPDATES = {
  assigned: 'Assigned to the field team. A site inspection is being scheduled.',
  in_progress: 'Field team is on site. Work has started and an update will follow after the inspection.',
  resolved: 'Work completed and verified by the field team.',
};

export function buildSeedReports(now = Date.now()) {
  const base = SPECS.map((s, i) => {
    const loc = nearestLocality(...localityLatLng(s.locality));
    const point = jitter(loc.lat, loc.lng, s.offset, i + 3);
    const createdAt = new Date(now - s.days * 864e5 - (i % 7) * 36e5).toISOString();
    const team = s.team || TEAM_FOR_CATEGORY[s.cat];
    const assignee = s.status === 'assigned' || s.status === 'in_progress' || s.status === 'resolved'
      ? TEAM_LEADS[team] || 'Field crew'
      : null;
    return {
      id: `CP-${1001 + i}`,
      key: s.key,
      createdAt,
      updatedAt: createdAt,
      status: s.status,
      category: s.cat,
      submittedCategory: s.cat,
      text: s.text,
      area: s.locality,
      zone: loc.zone,
      ward: loc.ward,
      location: { lat: point.lat, lng: point.lng, address: addressFor(s) },
      photo: null,
      photoMeta: null,
      reporter: { name: 'Anonymous citizen', channel: 'Citizen app' },
      source: 'synthetic-seed',
      confirmations: s.confirmations || 0,
      duplicateOf: null,
      team: team || null,
      assignee,
      dueAt: null,
      resolution: s.resolution || null,
      comments: [],
      history: [],
      ai: null,
      priority: null,
      summary: null,
      _spec: s,
    };
  });

  const byKey = Object.fromEntries(base.map(r => [r.key, r]));
  for (const r of base) {
    const s = r._spec;
    if (s.dupOf && byKey[s.dupOf]) {
      r.duplicateOf = byKey[s.dupOf].id;
      byKey[s.dupOf].confirmations = (byKey[s.dupOf].confirmations || 0) + 1;
    }
  }

  for (const r of base) {
    const s = r._spec;
    const created = new Date(r.createdAt).getTime();
    const updateLagDays = s.status === 'resolved'
      ? Math.min(2.2, s.days * 0.45)
      : s.status === 'in_progress' ? 0.35 : s.status === 'assigned' ? 0.6 : s.status === 'review' ? 0.15 : 0;
    const updated = Math.min(now - 60e3, now - Math.max(0.05, s.days - updateLagDays) * 864e5);
    r.updatedAt = new Date(updated).toISOString();

    const events = [{
      at: r.createdAt,
      type: 'created',
      actor: 'Citizen',
      text: `Report received via ${r.reporter.channel}.`,
    }];

    if (r.duplicateOf) {
      events.push({
        at: new Date(created + 25 * 60e3).toISOString(),
        type: 'duplicate',
        actor: 'AI suggestion · confirmed by ops',
        text: `Linked as a duplicate of ${r.duplicateOf}.`,
      });
    }

    const flow = [];
    if (s.status === 'review') flow.push(['review', 0.15]);
    if (['assigned', 'in_progress', 'resolved'].includes(s.status)) flow.push(['review', 0.12], ['assigned', 0.28]);
    if (s.status === 'in_progress') flow.push(['in_progress', 0.55]);
    if (s.status === 'resolved') flow.push(['in_progress', 0.6], ['resolved', 1]);
    if (s.status === 'rejected') flow.push(['rejected', 0.3]);

    let prev = 'new';
    for (const [to, frac] of flow) {
      const at = new Date(created + (updated - created) * frac).toISOString();
      const text = to === 'resolved'
        ? `Resolved: ${r.resolution || 'Work completed.'}`
        : to === 'assigned'
          ? `Assigned to ${r.team}${r.assignee ? ` · ${r.assignee}` : ''}.`
          : to === 'in_progress'
            ? 'Field team started work on site.'
            : to === 'rejected'
              ? 'Closed after review. The issue was outside municipal scope or not reproducible.'
              : 'Moved to human review after AI triage.';
      events.push({ at, type: to === 'assigned' ? 'assignment' : 'status', actor: to === 'assigned' ? 'Operations desk' : 'Operations desk', text, from: prev, to });
      prev = to;
    }

    if (r.team && s.status !== 'new' && s.status !== 'review') {
      r.dueAt = new Date(created + PRIORITY_META[priorityForCategory(s.cat)].sla * 36e5).toISOString();
    }

    if (['assigned', 'in_progress', 'resolved'].includes(s.status)) {
      const at = new Date(created + (updated - created) * 0.35).toISOString();
      r.comments.push({
        id: `${r.id}-c1`,
        at,
        author: r.assignee || 'Operations desk',
        internal: false,
        text: PUBLIC_UPDATES[s.status] || PUBLIC_UPDATES.assigned,
      });
    }
    if (s.status === 'resolved' && r.resolution) {
      r.comments.push({
        id: `${r.id}-c2`,
        at: r.updatedAt,
        author: r.assignee || 'Field team',
        internal: false,
        text: r.resolution,
      });
    }
    if (s.status === 'assigned' && r.assignee) {
      r.comments.push({
        id: `${r.id}-c3`,
        at: new Date(created + (updated - created) * 0.5).toISOString(),
        author: r.assignee,
        internal: true,
        text: 'Site visit planned with the ward supervisor. Access may be constrained by parked vehicles.',
      });
    }

    r.history = events.sort((a, b) => new Date(a.at) - new Date(b.at));
    delete r._spec;
  }

  return base;
}

function localityLatLng(name) {
  const map = {
    Ejipura: [12.9306, 77.6212],
    'Koramangala 5th Block': [12.9352, 77.6245],
    'Koramangala 4th Block': [12.9337, 77.6300],
    'Koramangala 6th Block': [12.9380, 77.6180],
    'Sony World Signal': [12.9348, 77.6238],
    'HSR Layout Sector 1': [12.9121, 77.6412],
    'HSR Layout Sector 2': [12.9088, 77.6458],
    'HSR Layout Sector 3': [12.9160, 77.6390],
    'BTM Layout 2nd Stage': [12.9166, 77.6101],
    'Silk Board': [12.9177, 77.6233],
    'Jayanagar 4th Block': [12.9299, 77.5833],
    'Indiranagar 100ft Road': [12.9784, 77.6408],
    Domlur: [12.9610, 77.6387],
    Bellandur: [12.9256, 77.6740],
    'Jeevan Bima Nagar': [12.9700, 77.6650],
    Ulsoor: [12.9820, 77.6250],
    'MG Road': [12.9756, 77.6068],
    'Richmond Town': [12.9580, 77.6010],
    Shanthinagar: [12.9560, 77.5960],
    'Wilson Garden': [12.9470, 77.5960],
    Adugodi: [12.9420, 77.6050],
    'Vivek Nagar': [12.9260, 77.6100],
    'Austin Town': [12.9550, 77.6100],
    'CV Raman Nagar': [12.9850, 77.6600],
  };
  return map[name] || [12.93, 77.62];
}

function addressFor(s) {
  const suffixes = ['Main Road', '5th Cross', '2nd Cross', '80 Feet Road', 'Ring Road', 'Market Road', 'Park Road'];
  const idx = Math.abs(s.key.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % suffixes.length;
  return `${suffixes[idx]}, ${s.locality}, Bengaluru`;
}

function priorityForCategory(cat) {
  return cat === 'Safety Hazard' ? 'High' : cat === 'Waterlogging' || cat === 'Drainage' ? 'High' : 'Medium';
}

// A labelled "simulated surge" used by the demo controls. Not real data.
export const SURGE_SPECS = [
  { cat: 'Waterlogging', locality: 'Ejipura', offset: 25, text: 'Water is rising again at Ejipura signal after 30 minutes of rain. It is above the footpath and entering the nearby shops.' },
  { cat: 'Drainage', locality: 'Ejipura', offset: 65, text: 'The drain near Ejipura 5th cross is overflowing again. Same spot as last week and the smell is back.' },
  { cat: 'Road Damage', locality: 'Ejipura', offset: 85, text: 'The road near Ejipura signal has caved in after the water receded. A scooter rider fell this morning.' },
];

export function buildSurgeReports(now = Date.now()) {
  return SURGE_SPECS.map((s, i) => {
    const loc = nearestLocality(...localityLatLng(s.locality));
    const point = jitter(loc.lat, loc.lng, s.offset, 90 + i);
    return {
      createdAt: new Date(now - (i + 1) * 22 * 60e3).toISOString(),
      updatedAt: new Date(now - (i + 1) * 22 * 60e3).toISOString(),
      status: 'new',
      category: s.cat,
      submittedCategory: s.cat,
      text: s.text,
      area: s.locality,
      zone: loc.zone,
      ward: loc.ward,
      location: { lat: point.lat, lng: point.lng, address: `5th Cross, ${s.locality}, Bengaluru` },
      photo: null,
      photoMeta: null,
      reporter: { name: 'Anonymous citizen', channel: 'Citizen app (simulated)' },
      source: 'simulated-surge',
      confirmations: 0,
      duplicateOf: null,
      team: TEAM_FOR_CATEGORY[s.cat],
      assignee: null,
      dueAt: null,
      resolution: null,
      comments: [],
      history: [],
      ai: null,
      priority: null,
      summary: null,
    };
  });
}
