import { readFile } from "node:fs/promises";

const API_KEY = process.env.MINDEE_API_KEY!;
const MODEL_ID = "ad61294e-5fe9-4309-a975-2980fa280aca";
const FILE_PATH = "./my-image.jpg";

async function run() {
  const fileBuffer = await readFile(FILE_PATH);

  const form = new FormData();
  form.append("model_id", MODEL_ID);
  form.append("file", new Blob([fileBuffer]), "my-image.jpg");
  form.append("confidence", "true");
  form.append("polygon", "true");

  const enqueueRes = await fetch(
    "https://api-v2.mindee.net/v2/products/extraction/enqueue",
    {
      method: "POST",
      headers: {
        Authorization: API_KEY,
      },
      body: form,
    }
  );

  if (!enqueueRes.ok) {
    throw new Error(`Enqueue failed: ${await enqueueRes.text()}`);
  }

  const { job } = await enqueueRes.json();

  while (true) {
    const pollRes = await fetch(`${job.polling_url}?redirect=false`, {
      headers: { Authorization: API_KEY },
    });

    const { job: polledJob } = await pollRes.json();

    if (polledJob.status === "Processed") {
      const resultRes = await fetch(polledJob.result_url, {
        headers: { Authorization: API_KEY },
      });
      const result = await resultRes.json();
      console.log(JSON.stringify(result.inference.result.fields, null, 2));
      break;
    }

    if (polledJob.status === "Failed") {
      throw new Error(JSON.stringify(polledJob.error));
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

run().catch(console.error);