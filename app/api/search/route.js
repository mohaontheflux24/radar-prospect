const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "RadarProspect/1.0 (usage prospection locale)";

export async function POST(req) {
  try {
    const { address, radiusKm } = await req.json();

    if (!address || typeof address !== "string" || !address.trim()) {
      return json({ error: "Adresse manquante." }, 400);
    }
    const radius = clamp(Number(radiusKm) || 2, 0.2, 25);

    // 1. Géocodage de l'adresse (Nominatim)
    const geoRes = await fetch(
      `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    );
    if (!geoRes.ok) {
      return json({ error: "Le service de géocodage est indisponible." }, 502);
    }
    const geoData = await geoRes.json();
    if (!geoData.length) {
      return json({ error: "Adresse introuvable. Précise-la (ville, pays)." }, 404);
    }
    const center = { lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon) };

    // 2. Recherche des commerces alentour (Overpass)
    const radiusM = Math.round(radius * 1000);
    const query = `
      [out:json][timeout:25];
      (
        node["shop"](around:${radiusM},${center.lat},${center.lon});
        way["shop"](around:${radiusM},${center.lat},${center.lon});
        node["office"](around:${radiusM},${center.lat},${center.lon});
        way["office"](around:${radiusM},${center.lat},${center.lon});
        node["craft"](around:${radiusM},${center.lat},${center.lon});
        way["craft"](around:${radiusM},${center.lat},${center.lon});
        node["amenity"~"^(restaurant|cafe|bar|fast_food|pharmacy|bank|clinic|dentist|veterinary|hairdresser|beauty_salon|car_rental|driving_school)$"](around:${radiusM},${center.lat},${center.lon});
        way["amenity"~"^(restaurant|cafe|bar|fast_food|pharmacy|bank|clinic|dentist|veterinary|hairdresser|beauty_salon|car_rental|driving_school)$"](around:${radiusM},${center.lat},${center.lon});
      );
      out center tags;
    `;

    const overpassRes = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
      body: query,
    });
    if (!overpassRes.ok) {
      return json({ error: "Le service de cartographie est indisponible. Réessaie dans un instant." }, 502);
    }
    const overpassData = await overpassRes.json();

    const seen = new Set();
    const businesses = [];
    for (const el of overpassData.elements || []) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const key = `${name}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const category = tags.shop || tags.office || tags.craft || tags.amenity || "commerce";
      const hasWebsite = Boolean(tags.website || tags["contact:website"]);
      const distanceKm = haversine(center.lat, center.lon, lat, lon);

      businesses.push({
        id: `${el.type}/${el.id}`,
        name,
        category: category.replace(/_/g, " "),
        lat,
        lon,
        distanceKm,
        hasWebsite,
        openingHours: tags.opening_hours || null,
        phone: tags.phone || tags["contact:phone"] || null,
        address: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || null,
        website: tags.website || tags["contact:website"] || null,
      });
    }

    businesses.sort((a, b) => a.distanceKm - b.distanceKm);

    return json({ center, businesses: businesses.slice(0, 60) });
  } catch (err) {
    console.error(err);
    return json({ error: "Erreur inattendue pendant la recherche." }, 500);
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
