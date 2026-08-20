const MODEL = process.env.ANALYZE_MODEL || "claude-sonnet-5";

export async function POST(req) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json(
        {
          error:
            "Aucune clé ANTHROPIC_API_KEY n'est configurée sur ce déploiement. Ajoute-la dans Vercel → Project Settings → Environment Variables, puis redéploie.",
        },
        500
      );
    }

    const { business, product } = await req.json();
    if (!business || !business.name) {
      return json({ error: "Commerce invalide." }, 400);
    }
    const productLabel = (product || "").trim() || "un service pour commerces locaux";

    const facts = [
      `Nom : ${business.name}`,
      `Catégorie (OpenStreetMap) : ${business.category || "inconnue"}`,
      `Distance du point de recherche : ${business.distanceKm?.toFixed(1)} km`,
      `Site web déclaré : ${business.hasWebsite ? business.website || "oui (url non précisée)" : "aucun site web trouvé"}`,
      `Horaires connus : ${business.openingHours || "non renseignés"}`,
      `Téléphone connu : ${business.phone || "non renseigné"}`,
      `Adresse : ${business.address || "non précisée"}`,
    ].join("\n");

    const systemPrompt = `Tu es un consultant en prospection commerciale B2B pour indépendants et petites agences (ex. création de sites web, référencement, marketing local).
On te donne les infos publiques et limitées d'un commerce local (issues d'OpenStreetMap, donc potentiellement incomplètes) et le produit/service que l'utilisateur souhaite lui vendre.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, au format exact suivant :
{
  "analysis": "2 à 4 phrases sur la présence en ligne probable de ce commerce et son potentiel comme client, en restant honnête sur le fait que les données sont limitées",
  "improvements": ["3 à 5 suggestions concrètes et courtes pour améliorer la présence en ligne ou l'activité de ce commerce"],
  "pitch": "Un court argumentaire de vente (6 à 10 phrases, ton direct et concret, à dire en personne ou par téléphone) expliquant pourquoi ce commerce a intérêt à prendre le produit/service de l'utilisateur, adapté à ce type de commerce précis"
}`;

    const userPrompt = `Produit/service à vendre : ${productLabel}\n\nInfos sur le commerce :\n${facts}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic API error:", resp.status, errText);
      return json(
        { error: `Erreur de l'API Claude (${resp.status}). Vérifie la clé API et le crédit disponible.` },
        502
      );
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return json({ error: "Réponse IA vide." }, 502);
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse failed:", cleaned);
      return json({ error: "Impossible d'interpréter la réponse de l'IA." }, 502);
    }

    return json({
      analysis: parsed.analysis || "",
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      pitch: parsed.pitch || "",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Erreur inattendue pendant l'analyse." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
