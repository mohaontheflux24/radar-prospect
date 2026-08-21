"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const MapView = dynamic(() => import("./components/MapView"), { ssr: false });
const STORAGE_KEY = "radar-prospect-leads-v1";
const LEAD_STATUSES = ["À contacter", "Contacté", "Rendez-vous", "Client", "Refusé"];

export default function Home() {
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(2);
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [center, setCenter] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [analyses, setAnalyses] = useState({}); // id -> { loading, error, data }
  const [activeId, setActiveId] = useState(null);
  const [savedProspects, setSavedProspects] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [showProspects, setShowProspects] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setSavedProspects(JSON.parse(stored));
    } catch (err) {
      console.error("Impossible de charger les prospects :", err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProspects));
  }, [savedProspects, storageReady]);

  const savedIds = useMemo(
    () => new Set(savedProspects.map((lead) => lead.business.id)),
    [savedProspects]
  );

  const saveProspect = useCallback((biz) => {
    setSavedProspects((current) => {
      if (current.some((lead) => lead.business.id === biz.id)) return current;
      return [
        {
          id: `${biz.id}-${Date.now()}`,
          business: biz,
          status: "À contacter",
          notes: "",
          followUpAt: "",
          savedAt: new Date().toISOString(),
        },
        ...current,
      ];
    });
  }, []);

  const updateProspect = useCallback((id, changes) => {
    setSavedProspects((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, ...changes } : lead))
    );
  }, []);

  const removeProspect = useCallback((id) => {
    setSavedProspects((current) => current.filter((lead) => lead.id !== id));
  }, []);

  const handleSearch = useCallback(
    async (e) => {
      e.preventDefault();
      if (!address.trim()) {
        setError("Indique une adresse ou une ville de départ.");
        return;
      }
      setLoading(true);
      setError("");
      setBusinesses([]);
      setAnalyses({});
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, radiusKm: Number(radius) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Échec de la recherche.");
        setCenter(data.center);
        setBusinesses(data.businesses);
        if (data.businesses.length === 0) {
          setError("Aucun commerce trouvé dans ce rayon. Essaie un rayon plus large.");
        }
      } catch (err) {
        setError(err.message || "Une erreur est survenue.");
      } finally {
        setLoading(false);
      }
    },
    [address, radius]
  );

  const handleAnalyze = useCallback(
    async (biz) => {
      setAnalyses((prev) => ({
        ...prev,
        [biz.id]: { loading: true, error: "", data: prev[biz.id]?.data || null },
      }));
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business: biz, product }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Échec de l'analyse.");
        setAnalyses((prev) => ({ ...prev, [biz.id]: { loading: false, error: "", data } }));
        setSavedProspects((current) =>
          current.map((lead) =>
            lead.business.id === biz.id ? { ...lead, analysis: data } : lead
          )
        );
      } catch (err) {
        setAnalyses((prev) => ({
          ...prev,
          [biz.id]: { loading: false, error: err.message || "Erreur", data: null },
        }));
      }
    },
    [product]
  );

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          Radar Prospect
        </div>
        <button
          type="button"
          className={`prospects-toggle ${showProspects ? "active" : ""}`}
          onClick={() => setShowProspects((value) => !value)}
        >
          Mes prospects <span>{savedProspects.length}</span>
        </button>
      </div>

      {showProspects && (
        <section className="crm-panel">
          <div className="crm-header">
            <div>
              <div className="eyebrow">Mini CRM</div>
              <h2>Mes prospects enregistrés</h2>
            </div>
            <button type="button" className="close-crm" onClick={() => setShowProspects(false)}>
              Fermer
            </button>
          </div>

          {savedProspects.length === 0 ? (
            <div className="empty-state">
              Aucun prospect enregistré. Lance une recherche puis clique sur « Enregistrer ».
            </div>
          ) : (
            <div className="lead-list">
              {savedProspects.map((lead) => (
                <article className="lead-card" key={lead.id}>
                  <div className="lead-title-row">
                    <div>
                      <h3>{lead.business.name}</h3>
                      <p>{lead.business.category || "Commerce"} · {lead.business.address || "Adresse non renseignée"}</p>
                    </div>
                    <button
                      type="button"
                      className="delete-lead"
                      onClick={() => removeProspect(lead.id)}
                    >
                      Supprimer
                    </button>
                  </div>

                  <div className="lead-contact">
                    <span>{lead.business.phone || "Téléphone non renseigné"}</span>
                    {lead.business.website && (
                      <a href={lead.business.website} target="_blank" rel="noreferrer">Voir le site</a>
                    )}
                  </div>

                  <div className="lead-fields">
                    <label>
                      Statut
                      <select
                        value={lead.status}
                        onChange={(e) => updateProspect(lead.id, { status: e.target.value })}
                      >
                        {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <label>
                      Date de relance
                      <input
                        type="date"
                        value={lead.followUpAt}
                        onChange={(e) => updateProspect(lead.id, { followUpAt: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="notes-field">
                    Notes personnelles
                    <textarea
                      rows="3"
                      placeholder="Ex. appelé mardi, intéressé par un site vitrine…"
                      value={lead.notes}
                      onChange={(e) => updateProspect(lead.id, { notes: e.target.value })}
                    />
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="hero">
        <div>
          <div className="eyebrow">Prospection locale assistée par IA</div>
          <h1>Repère les commerces autour de toi, sais quoi leur dire.</h1>
          <p className="lede">
            Entre ce que tu vends, une adresse et un rayon en kilomètres. L&apos;outil
            localise les commerces alentour sur la carte, puis génère pour chacun une
            analyse et un argumentaire de vente prêt à l&apos;emploi.
          </p>
        </div>
        <div className="radar" aria-hidden="true">
          <div className="radar-ring r1" />
          <div className="radar-ring r2" />
          <div className="radar-ring r3" />
          <div className="radar-ring r4" />
          <div className="radar-sweep" />
          <div className="radar-blip" style={{ top: "30%", left: "62%" }} />
          <div className="radar-blip" style={{ top: "58%", left: "38%" }} />
          <div className="radar-blip" style={{ top: "70%", left: "68%" }} />
          <div className="radar-core" />
        </div>
      </section>

      <form className="panel" onSubmit={handleSearch}>
        <h2>Lancer un balayage</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="product">Ce que tu vends</label>
            <input
              id="product"
              type="text"
              placeholder="ex. site vitrine, référencement local…"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="address">Adresse ou ville de départ</label>
            <input
              id="address"
              type="text"
              placeholder="ex. Aiseau, Belgique"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="radius">
              Rayon — <span className="radius-value">{radius} km</span>
            </label>
            <input
              id="radius"
              type="number"
              min="1"
              max="25"
              step="1"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Balayage en cours…" : "Scanner la zone"}
          </button>
        </div>
        {error && <div className="status-line error">{error}</div>}
        {!error && businesses.length > 0 && (
          <div className="status-line">
            {businesses.length} commerce(s) détecté(s) dans un rayon de {radius} km.
          </div>
        )}
      </form>

      {center && (
        <div className="results">
          <div className="map-wrap">
            <MapView
              center={center}
              radiusKm={Number(radius)}
              businesses={businesses}
              activeId={activeId}
            />
          </div>
          <div className="list-wrap">
            {businesses.length === 0 && (
              <div className="empty-state">Aucun résultat pour l&apos;instant.</div>
            )}
            {businesses.map((biz) => {
              const state = analyses[biz.id];
              return (
                <div
                  key={biz.id}
                  className="biz-card"
                  onMouseEnter={() => setActiveId(biz.id)}
                  onMouseLeave={() => setActiveId(null)}
                >
                  <div className="biz-head">
                    <span className="biz-name">{biz.name}</span>
                    <span className="biz-dist">{biz.distanceKm.toFixed(1)} km</span>
                  </div>
                  <div className="biz-meta">{biz.category || "commerce"}</div>
                  <div className="biz-flags">
                    {!biz.hasWebsite && <span className="flag no-site">pas de site web</span>}
                    {biz.hasWebsite && <span className="flag">a un site</span>}
                    {biz.openingHours && <span className="flag">horaires connus</span>}
                  </div>
                  <div className="biz-actions">
                    <button
                      type="button"
                      className={`save-btn ${savedIds.has(biz.id) ? "saved" : ""}`}
                      onClick={() => saveProspect(biz)}
                      disabled={savedIds.has(biz.id)}
                    >
                      {savedIds.has(biz.id) ? "✓ Enregistré" : "+ Enregistrer"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleAnalyze(biz)}
                      disabled={state?.loading || !product.trim()}
                      title={!product.trim() ? "Indique d'abord ce que tu vends" : ""}
                    >
                      {state?.loading
                        ? "Analyse en cours…"
                        : state?.data
                        ? "Regénérer l'analyse"
                        : "Analyser & générer le pitch"}
                    </button>
                  </div>

                  {state?.error && <div className="status-line error">{state.error}</div>}

                  {state?.data && (
                    <div className="analysis">
                      <h4>Analyse du commerce</h4>
                      <p>{state.data.analysis}</p>

                      <h4>Pistes d&apos;amélioration</h4>
                      <ul>
                        {state.data.improvements.map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>

                      <h4>Ce qu&apos;il faut leur dire</h4>
                      <div className="pitch-box">
                        {state.data.pitch}
                        <button
                          className="copy-btn"
                          onClick={() => navigator.clipboard?.writeText(state.data.pitch)}
                        >
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="footer-note">
        Données de localisation : OpenStreetMap / Nominatim / Overpass (licence ODbL).
        Les infos disponibles sur chaque commerce dépendent de ce qui est renseigné dans
        OpenStreetMap et peuvent être incomplètes. Vérifie toujours les informations avant
        de démarcher un commerce.
      </div>
    </div>
  );
}
