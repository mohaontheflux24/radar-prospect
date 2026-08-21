"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const MapView = dynamic(() => import("./components/MapView"), { ssr: false });
const STORAGE_KEY = "radar-prospect-leads-v1";
const LEAD_STATUSES = ["À contacter", "Contacté", "Rendez-vous", "Client", "Refusé"];

function getPotentialScore(business) {
  let score = 15;
  if (!business.hasWebsite) score += 40;
  if (business.phone) score += 20;
  if (business.address) score += 10;
  if (business.openingHours) score += 10;
  if (business.distanceKm <= 3) score += 5;
  return Math.min(score, 100);
}

function getWhatsAppUrl(phone, message) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `32${digits.slice(1)}`;
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function getEmailUrl(email, businessName, message) {
  if (!email) return null;
  const subject = `Proposition pour ${businessName}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

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
  const [filters, setFilters] = useState({ noWebsite: false, withPhone: false, hideSaved: false });

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

  const filteredBusinesses = useMemo(() => {
    return businesses
      .filter((biz) => !filters.noWebsite || !biz.hasWebsite)
      .filter((biz) => !filters.withPhone || Boolean(biz.phone))
      .filter((biz) => !filters.hideSaved || !savedIds.has(biz.id))
      .sort((a, b) => getPotentialScore(b) - getPotentialScore(a));
  }, [businesses, filters, savedIds]);

  const crmStats = useMemo(() => {
    const count = (status) => savedProspects.filter((lead) => lead.status === status).length;
    const contacted = savedProspects.filter((lead) => lead.status !== "À contacter").length;
    const clients = count("Client");
    return {
      total: savedProspects.length,
      contacted,
      appointments: count("Rendez-vous"),
      clients,
      conversion: contacted ? Math.round((clients / contacted) * 100) : 0,
    };
  }, [savedProspects]);

  const exportProspects = useCallback(() => {
    const safeCell = (value) => {
      const text = String(value ?? "").replace(/"/g, '""');
      const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${protectedText}"`;
    };
    const rows = [
      ["Nom", "Catégorie", "Téléphone", "Adresse", "Site", "Score", "Statut", "Relance", "Notes"],
      ...savedProspects.map((lead) => [
        lead.business.name,
        lead.business.category,
        lead.business.phone,
        lead.business.address,
        lead.business.website,
        getPotentialScore(lead.business),
        lead.status,
        lead.followUpAt,
        lead.notes,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(safeCell).join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `radar-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [savedProspects]);

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
            <>
              <div className="stats-grid">
                <div><strong>{crmStats.total}</strong><span>Prospects</span></div>
                <div><strong>{crmStats.contacted}</strong><span>Contactés</span></div>
                <div><strong>{crmStats.appointments}</strong><span>Rendez-vous</span></div>
                <div><strong>{crmStats.clients}</strong><span>Clients</span></div>
                <div><strong>{crmStats.conversion}%</strong><span>Conversion</span></div>
              </div>
              <button type="button" className="export-btn" onClick={exportProspects}>
                Télécharger la liste CSV
              </button>
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
            </>
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

      {businesses.length > 0 && (
        <div className="filters-bar">
          <strong>Filtres</strong>
          <label>
            <input
              type="checkbox"
              checked={filters.noWebsite}
              onChange={(e) => setFilters((current) => ({ ...current, noWebsite: e.target.checked }))}
            />
            Sans site web
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.withPhone}
              onChange={(e) => setFilters((current) => ({ ...current, withPhone: e.target.checked }))}
            />
            Avec téléphone
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.hideSaved}
              onChange={(e) => setFilters((current) => ({ ...current, hideSaved: e.target.checked }))}
            />
            Masquer les enregistrés
          </label>
          <span>{filteredBusinesses.length} résultat(s)</span>
        </div>
      )}

      {center && (
        <div className="results">
          <div className="map-wrap">
            <MapView
              center={center}
              radiusKm={Number(radius)}
              businesses={filteredBusinesses}
              activeId={activeId}
            />
          </div>
          <div className="list-wrap">
            {filteredBusinesses.length === 0 && (
              <div className="empty-state">Aucun résultat pour l&apos;instant.</div>
            )}
            {filteredBusinesses.map((biz) => {
              const state = analyses[biz.id];
              const score = getPotentialScore(biz);
              return (
                <div
                  key={biz.id}
                  className="biz-card"
                  onMouseEnter={() => setActiveId(biz.id)}
                  onMouseLeave={() => setActiveId(null)}
                >
                  <div className="biz-head">
                    <span className="biz-name">{biz.name}</span>
                    <div className="biz-numbers">
                      <span className={`score score-${score >= 70 ? "high" : score >= 45 ? "mid" : "low"}`}>
                        Potentiel {score}/100
                      </span>
                      <span className="biz-dist">{biz.distanceKm.toFixed(1)} km</span>
                    </div>
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

                      {state.data.messages && (
                        <div className="message-templates">
                          <h4>Messages prêts à envoyer</h4>
                          {[
                            ["WhatsApp", state.data.messages.whatsapp],
                            ["E-mail", state.data.messages.email],
                            ["Téléphone", state.data.messages.phone],
                            ["Face-à-face", state.data.messages.inPerson],
                          ].map(([label, message]) => message && (
                            <div className="template-box" key={label}>
                              <strong>{label}</strong>
                              <p>{message}</p>
                              <div className="template-actions">
                                <button type="button" onClick={() => navigator.clipboard?.writeText(message)}>
                                  Copier
                                </button>
                                {label === "WhatsApp" && getWhatsAppUrl(biz.phone, message) && (
                                  <a
                                    className="direct-link whatsapp-link"
                                    href={getWhatsAppUrl(biz.phone, message)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Ouvrir WhatsApp
                                  </a>
                                )}
                                {label === "WhatsApp" && !biz.phone && (
                                  <span className="missing-contact">Numéro indisponible</span>
                                )}
                                {label === "E-mail" && getEmailUrl(biz.email, biz.name, message) && (
                                  <a
                                    className="direct-link email-link"
                                    href={getEmailUrl(biz.email, biz.name, message)}
                                  >
                                    Envoyer l’e-mail
                                  </a>
                                )}
                                {label === "E-mail" && !biz.email && (
                                  <span className="missing-contact">E-mail indisponible</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
