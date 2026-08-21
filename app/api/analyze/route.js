const MODEL = process.env.ANALYZE_MODEL || "openai/gpt-oss-20b";

export async function POST(req) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return json(
        {
          error:
            "Aucune clé GROQ_API_KEY n'est configurée. Ajoute-la dans Vercel → Settings → Environment Variables.",
        },
        500
      );
    }

    const { business, product } = await req.json();

    if (!business || !business.name) {
      return json({ error: "Commerce invalide." }, 400);
    }

    const productLabel =
      (product || "").trim() || "un service pour commerces locaux";

    const facts = [
      `Nom : ${business.name}`,
      `Catégorie : ${business.category || "inconnue"}`,
      `Distance : ${business.distanceKm?.toFixed(1) || "inconnue"} km`,
      `Site web : ${
        business.hasWebsite
          ? business.website || "oui"
          : "aucun site web trouvé"
      }`,
      `Horaires : ${business.openingHours || "non renseignés"}`,
      `Téléphone : ${business.phone || "non renseigné"}`,
      `Adresse : ${business.address || "non précisée"}`,
    ].join("\n");

    const systemPrompt = `Tu es un consultant en prospection commerciale B2B pour indépendants et petites agences.

Réponds uniquement avec un objet JSON valide, sans texte supplémentaire, sous ce format exact :
{
  "analysis": "2 à 4 phrases sur la présence en ligne du commerce et son potentiel comme client",
  "improvements": ["3 à 5 suggestions concrètes et courtes"],
  "pitch": "Un argumentaire de vente personnalisé de 6 à 10 phrases",
  "messages": {
    "whatsapp": "Un message WhatsApp personnalisé, naturel et court",
    "email": "Un e-mail professionnel avec objet et corps du message",
    "phone": "Un script téléphonique court avec introduction, valeur proposée et question finale",
    "inPerson": "Une présentation courte et naturelle à dire en face-à-face"
  }
}`;

    const userPrompt = `Produit ou service à vendre : ${productLabel}

Informations sur le commerce :
${facts}`;

    const resp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.4,
          max_completion_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error("Groq API error:", resp.status, errorText);

      return json(
        {
          error: `Erreur de l’API Groq (${resp.status}). Vérifie la clé API.`,
        },
        502
      );
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return json({ error: "Réponse IA vide." }, 502);
    }

    let parsed;

    try {
      parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
    } catch {
      console.error("JSON impossible à lire :", content);
      return json(
        { error: "Impossible d’interpréter la réponse de l’IA." },
        502
      );
    }

    return json({
      analysis: parsed.analysis || "",
      improvements: Array.isArray(parsed.improvements)
        ? parsed.improvements
        : [],
      pitch: parsed.pitch || "",
      messages: {
        whatsapp: parsed.messages?.whatsapp || "",
        email: parsed.messages?.email || "",
        phone: parsed.messages?.phone || "",
        inPerson: parsed.messages?.inPerson || "",
      },
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: "Erreur inattendue pendant l’analyse." },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
