export async function onRequest(context) {
  try {
    const bodyText = await context.request.text();
    console.log("M-PESA CALLBACK:", bodyText);

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Callback received",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || "Callback error",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
