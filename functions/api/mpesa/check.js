export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      hasShortcode: !!context.env.MPESA_SHORTCODE,
      hasPasskey: !!context.env.MPESA_PASSKEY,
      hasCallback: !!context.env.MPESA_CALLBACK_URL,
      shortcode: context.env.MPESA_SHORTCODE || null,
      callback: context.env.MPESA_CALLBACK_URL || null,
      env: context.env.MPESA_ENV || null,
    }),
    {
      headers: { "content-type": "application/json" },
    }
  );
}
