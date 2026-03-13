export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: true,
      hasKey: !!context.env.MPESA_CONSUMER_KEY,
      hasSecret: !!context.env.MPESA_CONSUMER_SECRET,
      env: context.env.MPESA_ENV || null,
    }),
    {
      headers: { "content-type": "application/json" },
    }
  );
}
