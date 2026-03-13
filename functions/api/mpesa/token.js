export async function onRequest(context) {
  try {
    const key = context.env.MPESA_CONSUMER_KEY;
    const secret = context.env.MPESA_CONSUMER_SECRET;
    const env = context.env.MPESA_ENV || "sandbox";

    if (!key || !secret) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const baseUrl =
      env === "production"
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

    return new Response(
      JSON.stringify({
        ok: res.ok,
        env,
        data,
      }),
      {
        status: res.status,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || "Token request failed",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
      }
