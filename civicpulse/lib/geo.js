// Geography helpers and the (approximate) locality gazetteer used by the demo.
// Coordinates are approximate centroids for synthetic demo data, not official boundaries.

export const LOCALITIES = [
  { name: 'Ejipura', lat: 12.9306, lng: 77.6212, zone: 'South', ward: 'Ward 151 · Ejipura' },
  { name: 'Koramangala 5th Block', lat: 12.9352, lng: 77.6245, zone: 'South', ward: 'Ward 151 · Koramangala' },
  { name: 'Koramangala 4th Block', lat: 12.9337, lng: 77.6300, zone: 'South', ward: 'Ward 151 · Koramangala' },
  { name: 'Koramangala 6th Block', lat: 12.9380, lng: 77.6180, zone: 'South', ward: 'Ward 151 · Koramangala' },
  { name: 'Sony World Signal', lat: 12.9348, lng: 77.6238, zone: 'South', ward: 'Ward 151 · Koramangala' },
  { name: 'HSR Layout Sector 1', lat: 12.9121, lng: 77.6412, zone: 'South', ward: 'Ward 174 · HSR Layout' },
  { name: 'HSR Layout Sector 2', lat: 12.9088, lng: 77.6458, zone: 'South', ward: 'Ward 174 · HSR Layout' },
  { name: 'HSR Layout Sector 3', lat: 12.9160, lng: 77.6390, zone: 'South', ward: 'Ward 174 · HSR Layout' },
  { name: 'BTM Layout 2nd Stage', lat: 12.9166, lng: 77.6101, zone: 'South', ward: 'Ward 176 · BTM Layout' },
  { name: 'Silk Board', lat: 12.9177, lng: 77.6233, zone: 'South', ward: 'Ward 176 · BTM Layout' },
  { name: 'Jayanagar 4th Block', lat: 12.9299, lng: 77.5833, zone: 'South', ward: 'Ward 153 · Jayanagar' },
  { name: 'Indiranagar 100ft Road', lat: 12.9784, lng: 77.6408, zone: 'East', ward: 'Ward 80 · Indiranagar' },
  { name: 'Domlur', lat: 12.9610, lng: 77.6387, zone: 'East', ward: 'Ward 112 · Domlur' },
  { name: 'Bellandur', lat: 12.9256, lng: 77.6740, zone: 'East', ward: 'Ward 150 · Bellandur' },
  { name: 'HAL 2nd Stage', lat: 12.9600, lng: 77.6600, zone: 'East', ward: 'Ward 87 · HAL' },
  { name: 'Jeevan Bima Nagar', lat: 12.9700, lng: 77.6650, zone: 'East', ward: 'Ward 88 · Jeevan Bima Nagar' },
  { name: 'Ulsoor', lat: 12.9820, lng: 77.6250, zone: 'East', ward: 'Ward 81 · Ulsoor' },
  { name: 'MG Road', lat: 12.9756, lng: 77.6068, zone: 'Central', ward: 'Ward 111 · MG Road' },
  { name: 'Richmond Town', lat: 12.9580, lng: 77.6010, zone: 'Central', ward: 'Ward 113 · Richmond Town' },
  { name: 'Shanthinagar', lat: 12.9560, lng: 77.5960, zone: 'Central', ward: 'Ward 117 · Shanthinagar' },
  { name: 'Wilson Garden', lat: 12.9470, lng: 77.5960, zone: 'Central', ward: 'Ward 148 · Wilson Garden' },
  { name: 'Adugodi', lat: 12.9420, lng: 77.6050, zone: 'Central', ward: 'Ward 148 · Adugodi' },
  { name: 'Vivek Nagar', lat: 12.9260, lng: 77.6100, zone: 'South', ward: 'Ward 152 · Vivek Nagar' },
  { name: 'Austin Town', lat: 12.9550, lng: 77.6100, zone: 'Central', ward: 'Ward 113 · Austin Town' },
  { name: 'CV Raman Nagar', lat: 12.9850, lng: 77.6600, zone: 'East', ward: 'Ward 57 · CV Raman Nagar' },
];

export const CATEGORIES = [
  { id: 'Waterlogging', label: 'Waterlogging', icon: 'water', team: 'Drainage & Stormwater', color: '#2563eb' },
  { id: 'Drainage', label: 'Drainage', icon: 'drain', team: 'Drainage & Stormwater', color: '#0f766e' },
  { id: 'Road Damage', label: 'Road damage', icon: 'road', team: 'Roads & Potholes', color: '#b45309' },
  { id: 'Waste Overflow', label: 'Waste overflow', icon: 'waste', team: 'Solid Waste Management', color: '#7c3aed' },
  { id: 'Streetlight', label: 'Streetlight', icon: 'light', team: 'Street Lighting', color: '#ca8a04' },
  { id: 'Safety Hazard', label: 'Safety hazard', icon: 'hazard', team: 'Electrical Safety', color: '#dc2626' },
  { id: 'Water Supply', label: 'Water supply', icon: 'tap', team: 'Water Supply', color: '#0891b2' },
  { id: 'Public Property', label: 'Public property', icon: 'bench', team: 'Public Property & Parks', color: '#475569' },
];

export const CATEGORY_IDS = CATEGORIES.map(c => c.id);
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const TEAMS = [
  { id: 'drainage', name: 'Drainage & Stormwater', short: 'Drainage', categories: ['Waterlogging', 'Drainage'], lead: 'R. Menon' },
  { id: 'roads', name: 'Roads & Potholes', short: 'Roads', categories: ['Road Damage'], lead: 'S. Kulkarni' },
  { id: 'waste', name: 'Solid Waste Management', short: 'Waste', categories: ['Waste Overflow'], lead: 'A. Fernandes' },
  { id: 'lighting', name: 'Street Lighting', short: 'Lighting', categories: ['Streetlight'], lead: 'K. Rao' },
  { id: 'electrical', name: 'Electrical Safety', short: 'Electrical', categories: ['Safety Hazard'], lead: 'M. Iyer' },
  { id: 'water', name: 'Water Supply', short: 'Water', categories: ['Water Supply'], lead: 'P. Shetty' },
  { id: 'property', name: 'Public Property & Parks', short: 'Property', categories: ['Public Property'], lead: 'N. Bhat' },
  { id: 'emergency', name: 'Emergency Response', short: 'Emergency', categories: [], lead: 'Control room' },
];

export const TEAM_MAP = Object.fromEntries(TEAMS.map(t => [t.id, t]));

export const TEAM_FOR_CATEGORY = Object.fromEntries(
  TEAMS.flatMap(t => t.categories.map(c => [c, t.name]))
);

export const STATUSES = [
  { id: 'new', label: 'New', citizen: 'Received', color: '#64748b' },
  { id: 'review', label: 'In review', citizen: 'Being reviewed', color: '#7c3aed' },
  { id: 'assigned', label: 'Assigned', citizen: 'Assigned to a team', color: '#2563eb' },
  { id: 'in_progress', label: 'In progress', citizen: 'Work started', color: '#d97706' },
  { id: 'resolved', label: 'Resolved', citizen: 'Resolved', color: '#059669' },
  { id: 'rejected', label: 'Closed', citizen: 'Closed', color: '#94a3b8' },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]));

export const OPEN_STATUSES = ['new', 'review', 'assigned', 'in_progress'];

export const ALLOWED_TRANSITIONS = {
  new: ['review', 'assigned', 'rejected'],
  review: ['assigned', 'rejected', 'new'],
  assigned: ['in_progress', 'review', 'resolved'],
  in_progress: ['resolved', 'assigned'],
  resolved: ['assigned'],
  rejected: ['review'],
};

export const PRIORITY_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITY_META = {
  Critical: { color: '#dc2626', bg: '#fef2f2', rank: 0, sla: 4, label: 'Critical' },
  High: { color: '#ea580c', bg: '#fff7ed', rank: 1, sla: 24, label: 'High' },
  Medium: { color: '#2563eb', bg: '#eff6ff', rank: 2, sla: 72, label: 'Medium' },
  Low: { color: '#64748b', bg: '#f8fafc', rank: 3, sla: 168, label: 'Low' },
};

export function haversine(a, b) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestLocality(lat, lng) {
  let best = LOCALITIES[0];
  let bestD = Infinity;
  for (const loc of LOCALITIES) {
    const d = haversine({ lat, lng }, loc);
    if (d < bestD) { bestD = d; best = loc; }
  }
  return { ...best, distance: Math.round(bestD) };
}

export function localityByName(name) {
  if (!name) return null;
  const q = String(name).toLowerCase().trim();
  return LOCALITIES.find(l => l.name.toLowerCase() === q)
    || LOCALITIES.find(l => l.name.toLowerCase().includes(q) || q.includes(l.name.toLowerCase()))
    || null;
}

export function formatMeters(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function jitter(lat, lng, meters, seed = 1) {
  // Deterministic pseudo-random offset for synthetic data.
  const rand = (n) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const dLat = ((rand(1) - 0.5) * 2 * meters) / 111320;
  const dLng = ((rand(2) - 0.5) * 2 * meters) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}
