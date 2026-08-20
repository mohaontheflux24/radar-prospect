"use client";

import { useEffect, useRef } from "react";

// Leaflet touche `window`, on l'importe dynamiquement côté client uniquement.
export default function MapView({ center, radiusKm, businesses, activeId }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    let map;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        map = L.map(containerRef.current, { zoomControl: true }).setView(
          [center.lat, center.lon],
          13
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
      } else {
        map = mapRef.current;
        map.setView([center.lat, center.lon], map.getZoom());
      }

      if (layerRef.current) {
        layerRef.current.clearLayers();
      } else {
        layerRef.current = L.layerGroup().addTo(map);
      }

      // Centre de recherche + cercle de rayon
      L.circleMarker([center.lat, center.lon], {
        radius: 6,
        color: "#f5a623",
        fillColor: "#f5a623",
        fillOpacity: 1,
      })
        .bindPopup("Point de recherche")
        .addTo(layerRef.current);

      L.circle([center.lat, center.lon], {
        radius: radiusKm * 1000,
        color: "#f5a623",
        weight: 1,
        fillColor: "#f5a623",
        fillOpacity: 0.04,
      }).addTo(layerRef.current);

      businesses.forEach((b) => {
        const marker = L.circleMarker([b.lat, b.lon], {
          radius: b.id === activeId ? 8 : 5,
          color: "#5eead4",
          fillColor: "#5eead4",
          fillOpacity: 0.9,
          weight: b.id === activeId ? 3 : 1,
        });
        marker.bindPopup(`<strong>${escapeHtml(b.name)}</strong><br/>${escapeHtml(
          b.category || ""
        )}`);
        marker.addTo(layerRef.current);
      });

      if (businesses.length > 0) {
        const bounds = L.latLngBounds([
          [center.lat, center.lon],
          ...businesses.map((b) => [b.lat, b.lon]),
        ]);
        map.fitBounds(bounds.pad(0.15));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon, radiusKm, businesses, activeId]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}
