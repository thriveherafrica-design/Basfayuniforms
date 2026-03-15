function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return "254" + digits;

  throw new Error("Phone number must look like 0712345678 or 254712345678");
}

function getKenyaTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`;
}

async function getAccessToken(env) {
  const key = env.MPESA_CONSUMER_KEY;
  const secret = env.MPESA_CONSUMER_SECRET;
  const mode = env.MPESA_ENV || "sandbox";

  if (!key || !secret) {
    throw new Error("Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET");
  }

  const baseUrl =
    mode === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  const auth = btoa(`${key}:${secret}`);

  const res = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(data.errorMessage || data.error_description || "Failed to get access token");
  }

  return { token: data.access_token, baseUrl };
}

export async function onRequest(context) {
  try {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    let phone, amount, accountReference, transactionDesc;

    if (request.method === "GET") {
      const url = new URL(request.url);
      phone = url.searchParams.get("phone");
      amount = url.searchParams.get("amount") || "1";
      accountReference = url.searchParams.get("reference") || "BASFAYTEST";
      transactionDesc = url.searchParams.get("desc") || "BASFAY Test Payment";
    } else if (request.method === "POST") {
      const body = await request.json();
      phone = body.phone;
      amount = body.amount_kes || body.amount || "1";
      accountReference = body.account_reference || body.reference || body.order_id || "BASFAYTEST";
      transactionDesc = body.transaction_desc || body.desc || "BASFAY Test Payment";
    } else {
      return json({ ok: false, error: "Use GET or POST" }, 405);
    }

    const shortcode = env.MPESA_SHORTCODE;
    const passkey = env.MPESA_PASSKEY;
    const callbackUrl = String(env.MPESA_CALLBACK_URL || "").trim();
    
    if (!shortcode || !passkey || !callbackUrl) {
      return json(
        {
          ok: false,
          error: "Missing MPESA_SHORTCODE, MPESA_PASSKEY, or MPESA_CALLBACK_URL",
        },
        500
      );
    }

    const cleanPhone = normalizePhone(phone);
    const timestamp = getKenyaTimestamp();
    const password = btoa(`${shortcode}${passkey}${timestamp}`);
    const finalAmount = Math.max(1, Math.round(Number(amount) || 0));

    const { token, baseUrl } = await getAccessToken(env);

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: finalAmount,
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    };

    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    return json(
      {
        ok: res.ok,
        env: env.MPESA_ENV || "sandbox",
        request: payload,
        response: data,
      },
      res.status
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message || "STK push failed",
      },
      500
    );
  }
}
