import axios from 'axios';

const api = axios.create({
  baseURL: 'http://hack.marrb.net:3000',
  timeout: 10000,
});

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
  }

  return config;
});

export interface AuthRequest {
  email: string;
  password: string;
}

export interface User {
  id: number;
  email: string;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  user: User;
}

export interface RoomMembership {
  role: 'owner' | 'member';
  joinedAt?: string;
  joined_at?: string;
}

export interface Room {
  id: string;
  name: string;
  ownerUserId: string;
  inviteCode: string;
  createdAt: string;
  updatedAt?: string;
  membership?: RoomMembership;
}

export interface ListRoomsResponse {
  rooms: Room[];
}

export interface CreateRoomResponse {
  message: string;
  room: Room;
}

export interface JoinRoomResponse {
  message: string;
  room: Room;
  membership: RoomMembership;
}

export interface RoomMemberEntry {
  user: {
    id: string;
    email: string;
  };
  membership: {
    role: 'owner' | 'member';
    joinedAt?: string;
    invitedByUserId?: string | null;
    joined_at?: string;
    invited_by_user_id?: string | null;
  };
}

export interface ListRoomMembersResponse {
  roomId: number;
  members: RoomMemberEntry[];
}

export interface TransactionTakenBy {
  userId: string;
  email: string;
  quantity: number;
  assignedByUserId: string;
  updatedAt: string;
}

export interface TransactionItem {
  id: string;
  itemName: string;
  itemCount: number;
  unitPrice: number;
  lineTotal: number;
  taken?: {
    takenCount: number;
    remainingCount: number;
    takenBy: TransactionTakenBy[];
  };
}

export interface RoomTransaction {
  id: string;
  roomId: string;
  owner: {
    userId: string;
    email: string;
  };
  companyName: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items: TransactionItem[];
}

export interface ListRoomTransactionsResponse {
  roomId: number;
  transactions: RoomTransaction[];
}

export interface CreateRoomTransactionPayload {
  companyName: string;
  ownerUserId: number;
  items: Array<{
    itemName: string;
    itemCount: number;
    unitPrice: number;
  }>;
}

export interface CreateRoomTransactionResponse {
  message?: string;
  transaction: RoomTransaction;
}

export interface UpdateRoomTransactionPayload {
  companyName?: string;
  ownerUserId?: number;
  items?: Array<{
    itemName: string;
    itemCount: number;
    unitPrice: number;
  }>;
}

export interface UpdateRoomTransactionResponse {
  message?: string;
  transaction: RoomTransaction;
}

export interface DeleteRoomTransactionResponse {
  message: string;
  deletedTransactionId: string;
}

export interface TakeItemPayload {
  quantity: number;
}

export interface TakeItemResponse {
  message?: string;
}

export interface AssignItemPayload {
  userId: number;
  quantity: number;
}

export interface AssignItemResponse {
  message?: string;
}

export interface ReceiptScanItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number | null;
}

export interface ReceiptScanResult {
  companyName: string;
  totalAmount: number | null;
  items: ReceiptScanItem[];
}

export interface VoiceReceiptAssignee {
  email: string;
  quantity: number;
}

export interface VoiceReceiptItem extends ReceiptScanItem {
  purchasedFor: VoiceReceiptAssignee[];
}

export interface VoiceReceiptParseResult {
  companyName: string;
  totalAmount: number | null;
  items: VoiceReceiptItem[];
}

export interface VoiceReceiptResult {
  transcript: string;
  receipt: VoiceReceiptParseResult;
}

const MINDEE_RECEIPT_MODEL_ID = 'ad61294e-5fe9-4309-a975-2980fa280aca'; //process.env.EXPO_PUBLIC_MINDEE_RECEIPT_MODEL_ID ?? '';
const MINDEE_API_TOKEN = 'md__vAPz2zzXhPUYCyX2kk_W8lvH_6rOOBXUsrIMmWE0Ic';
const MINDEE_V2_BASE_URL = 'https://api-v2.mindee.net';
const MINDEE_DEBUG_LOGS = true;
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_TRANSCRIPTION_MODEL = 'whisper-1';
const OPENAI_PARSE_MODEL = 'gpt-4o-mini';

const mindeeLog = (message: string, extra?: unknown) => {
  if (!MINDEE_DEBUG_LOGS) {
    return;
  }

  if (typeof extra === 'undefined') {
    console.info(`[Mindee] ${message}`);
    return;
  }

  console.info(`[Mindee] ${message}`, extra);
};

const openAiLog = (message: string, extra?: unknown) => {
  if (!MINDEE_DEBUG_LOGS) {
    return;
  }

  if (typeof extra === 'undefined') {
    console.info(`[OpenAI] ${message}`);
    return;
  }

  console.info(`[OpenAI] ${message}`, extra);
};

type MindeeV2Field = {
  value?: unknown;
  fields?: Record<string, MindeeV2Field>;
  items?: MindeeV2Field[];
};

type MindeeV2ExtractionResponse = {
  inference?: {
    result?: {
      fields?: Record<string, MindeeV2Field>;
    };
  };
  job?: {
    id?: string;
    status?: string;
    result_url?: string;
    polling_url?: string;
    error?: {
      detail?: string;
      title?: string;
      code?: string;
    };
  };
};

type MindeeErrorPayload = {
  code?: string;
  detail?: string;
  title?: string;
};

type MindeeV2Job = {
  id?: string;
  status?: string;
  result_url?: string;
  polling_url?: string;
  error?: MindeeErrorPayload;
};

type OpenAITranscriptionResponse = {
  text?: string;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const isMindeeJobNotFoundError = (status: number | undefined, responseData: unknown): boolean => {
  if (status !== 404) {
    return false;
  }

  if (typeof responseData === 'string') {
    return responseData.includes('404-009') || responseData.includes('Job with ID');
  }

  if (!responseData || typeof responseData !== 'object') {
    return false;
  }

  const payload = responseData as MindeeErrorPayload;
  return payload.code === '404-009' || String(payload.detail ?? '').includes('Job with ID');
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().replace(',', '.');
    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

const toPositiveInt = (value: number | null, fallback = 1): number => {
  if (value === null) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getMindeeReceiptModelId = (): string => {
  const modelId = MINDEE_RECEIPT_MODEL_ID.trim();

  if (!modelId || !isUuid(modelId)) {
    throw new Error(
      'Mindee v2 requires a UUID model ID. Set EXPO_PUBLIC_MINDEE_RECEIPT_MODEL_ID to your extraction model UUID.'
    );
  }

  return modelId;
};

const getOpenAiApiKey = (): string => {
  const apiKey = OPENAI_API_KEY.trim();

  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Set EXPO_PUBLIC_OPENAI_API_KEY in .env.');
  }

  return apiKey;
};

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' &&
  typeof process.versions?.node === 'string' &&
  typeof window === 'undefined';

const readV2SimpleFieldValue = (fields: Record<string, MindeeV2Field>, key: string): unknown => {
  const field = fields[key];
  if (!field || typeof field !== 'object') {
    return null;
  }

  return field.value ?? null;
};

const mapV2FieldsToReceiptResult = (fields: Record<string, MindeeV2Field>): ReceiptScanResult => {
  const supplierNameRaw =
    readV2SimpleFieldValue(fields, 'supplier_name') ??
    readV2SimpleFieldValue(fields, 'merchant_name') ??
    readV2SimpleFieldValue(fields, 'company_name');

  const supplierName = typeof supplierNameRaw === 'string' ? supplierNameRaw : null;
  const companyName = typeof supplierName === 'string' && supplierName.trim().length > 0
    ? supplierName.trim()
    : 'Receipt';

  const totalAmount = parseNumber(readV2SimpleFieldValue(fields, 'total_amount'));
  const lineItemsField = fields.line_items;
  const lineItems = Array.isArray(lineItemsField?.items) ? lineItemsField.items : [];

  const items: ReceiptScanItem[] = lineItems
    .map((lineItemField, index) => {
      const itemFields =
        lineItemField && typeof lineItemField === 'object' && lineItemField.fields
          ? lineItemField.fields
          : {};

      const itemNameRaw =
        readV2SimpleFieldValue(itemFields, 'description') ??
        readV2SimpleFieldValue(itemFields, 'product_name') ??
        readV2SimpleFieldValue(itemFields, 'name');

      const parsedQuantity = parseNumber(readV2SimpleFieldValue(itemFields, 'quantity'));
      const parsedUnitPrice = parseNumber(readV2SimpleFieldValue(itemFields, 'unit_price'));
      const parsedLineTotal = parseNumber(readV2SimpleFieldValue(itemFields, 'total_amount'));
      const quantity = toPositiveInt(parsedQuantity, 1);
      const unitPrice =
        parsedUnitPrice ??
        (parsedLineTotal !== null && quantity > 0 ? parsedLineTotal / quantity : 0);

      return {
        name:
          typeof itemNameRaw === 'string' && itemNameRaw.trim().length > 0
            ? itemNameRaw.trim()
            : `Item ${index + 1}`,
        quantity,
        unitPrice: Math.max(0, unitPrice),
        lineTotal: parsedLineTotal,
      };
    })
    .filter((item) => item.name.length > 0);

  return {
    companyName,
    totalAmount,
    items,
  };
};

const mapV2ResponseToReceiptResult = (response: MindeeV2ExtractionResponse): ReceiptScanResult => {
  const fields = response.inference?.result?.fields;
  if (!fields || typeof fields !== 'object') {
    throw new Error('Mindee response did not include extraction fields.');
  }

  return mapV2FieldsToReceiptResult(fields);
};

const resolveMindeeV2Url = (url: string): string => {
  if (url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${MINDEE_V2_BASE_URL}${url}`;
  }

  return `${MINDEE_V2_BASE_URL}/${url}`;
};

const scanReceiptWithMindeeClient = async (
  imageUri: string,
  mimeType: string
): Promise<ReceiptScanResult> => {
  mindeeLog('SDK scan start', { imageUri, mimeType });
  const modelId = getMindeeReceiptModelId();

  const dynamicImporter = new Function('moduleName', 'return import(moduleName);') as (
    moduleName: string
  ) => Promise<{
    Client: new (options: { apiKey: string }) => {
      enqueueAndGetResult: (
        productClass: unknown,
        inputSource: unknown,
        params: { modelId: string },
        pollingOptions?: {
          initialDelaySec?: number;
          delaySec?: number;
          maxRetries?: number;
        }
      ) => Promise<{ getRawHttp?: () => MindeeV2ExtractionResponse }>;
    };
    product: {
      Extraction: unknown;
    };
    BytesInput: new (options: { inputBytes: Uint8Array; filename: string }) => unknown;
  }>;

  const mindee = await dynamicImporter('mindee');
  const receiptResponse = await fetch(imageUri);
  if (!receiptResponse.ok) {
    throw new Error('Unable to load receipt image for scanning.');
  }

  const receiptBytes = new Uint8Array(await receiptResponse.arrayBuffer());
  const inputSource = new mindee.BytesInput({
    inputBytes: receiptBytes,
    filename: `receipt.${mimeType.includes('png') ? 'png' : 'jpg'}`,
  });

  const client = new mindee.Client({ apiKey: MINDEE_API_TOKEN });
  const result = await client.enqueueAndGetResult(
    mindee.product.Extraction,
    inputSource,
    {
      modelId,
    },
    {
      initialDelaySec: 1,
      delaySec: 1,
      maxRetries: 45,
    }
  );

  const rawResponse =
    typeof result.getRawHttp === 'function'
      ? result.getRawHttp()
      : ((result as unknown as MindeeV2ExtractionResponse) ?? {});

  mindeeLog('SDK scan completed');

  return mapV2ResponseToReceiptResult(rawResponse);
};

const scanReceiptWithRawHttp = async (
  imageUri: string,
  mimeType: string
): Promise<ReceiptScanResult> => {
  mindeeLog('HTTP scan start', { imageUri, mimeType });
  const modelId = getMindeeReceiptModelId();
  const fileName = `receipt.${mimeType.includes('png') ? 'png' : 'jpg'}`;

  const formData = new FormData();
  formData.append('model_id', modelId);

  if (isNodeRuntime()) {
    const imageResponse = await fetch(imageUri);
    if (!imageResponse.ok) {
      throw new Error('Unable to load receipt image for scanning.');
    }

    const imageBlob = await imageResponse.blob();
    formData.append('file', imageBlob, fileName);
  } else {
    formData.append('file', {
      uri: imageUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  }

  const parseMindeeJsonResponse = async <T>(response: Response): Promise<T> => {
    const rawBody = await response.text();
    let parsedBody = {} as T;

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody) as T;
      } catch (error) {
        mindeeLog('Failed to parse Mindee JSON body', {
          status: response.status,
          rawBody,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    mindeeLog('Mindee HTTP response received', {
      status: response.status,
      ok: response.ok,
      bodyPreview: rawBody.slice(0, 250),
    });

    if (!response.ok) {
      throw new Error(`Mindee request failed (${response.status}): ${rawBody}`);
    }

    return parsedBody;
  };

  let enqueueResponse: Response;
  try {
    enqueueResponse = await fetch(`${MINDEE_V2_BASE_URL}/v2/products/extraction/enqueue`, {
      method: 'POST',
      headers: {
        Authorization: MINDEE_API_TOKEN,
      },
      body: formData,
    });
  } catch (error) {
    mindeeLog('Enqueue network failure', {
      message: error instanceof Error ? error.message : String(error),
      imageUri,
      mimeType,
    });
    throw error;
  }

  const enqueueData = await parseMindeeJsonResponse<MindeeV2ExtractionResponse>(enqueueResponse);
  const initialJob: MindeeV2Job = enqueueData.job ?? {};
  mindeeLog('Enqueue response parsed', {
    jobId: initialJob.id,
    status: initialJob.status,
    pollingUrl: initialJob.polling_url,
    resultUrl: initialJob.result_url,
  });

  if (!initialJob.polling_url && !initialJob.id) {
    throw new Error('Mindee enqueue response did not include job polling information.');
  }

  const fallbackPollingUrl = initialJob.id ? `${MINDEE_V2_BASE_URL}/v2/jobs/${initialJob.id}` : '';
  const pollingBaseUrl = resolveMindeeV2Url(initialJob.polling_url ?? fallbackPollingUrl);
  const pollUrl = pollingBaseUrl.includes('?')
    ? `${pollingBaseUrl}&redirect=false`
    : `${pollingBaseUrl}?redirect=false`;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, attempt === 0 ? 3000 : 2000);
    });

    const pollResponse = await fetch(pollUrl, {
      headers: {
        Authorization: MINDEE_API_TOKEN,
      },
    });

    if (!pollResponse.ok) {
      const rawBody = await pollResponse.text();
      mindeeLog('Polling non-ok response', {
        attempt,
        status: pollResponse.status,
        rawBody,
      });
      const isTransientJobNotFound = isMindeeJobNotFoundError(pollResponse.status, rawBody);

      if (isTransientJobNotFound) {
        continue;
      }

      throw new Error(`Mindee polling failed (${pollResponse.status}): ${rawBody}`);
    }

    const pollData = (await pollResponse.json()) as MindeeV2ExtractionResponse;
    const polledJob = pollData.job;

    mindeeLog('Polling tick', {
      attempt,
      jobStatus: polledJob?.status,
      hasResultUrl: Boolean(polledJob?.result_url),
    });

    if (!polledJob) {
      continue;
    }

    if (polledJob.error) {
      throw new Error(
        polledJob.error.detail || polledJob.error.title || 'Mindee failed to process this receipt.'
      );
    }

    if (polledJob.status === 'Failed') {
      throw new Error('Mindee job failed without error details.');
    }

    if (polledJob.status === 'Processed' && polledJob.result_url) {
      mindeeLog('Job processed, fetching result', { resultUrl: polledJob.result_url });
      const resultResponse = await fetch(resolveMindeeV2Url(polledJob.result_url), {
        headers: {
          Authorization: MINDEE_API_TOKEN,
        },
      });

      const resultData = await parseMindeeJsonResponse<MindeeV2ExtractionResponse>(resultResponse);
      mindeeLog('Result fetched successfully');
      return mapV2ResponseToReceiptResult(resultData);
    }
  }

  throw new Error('Mindee result was not available after repeated retries.');
};

export const transcribeSpeechWithOpenAI = async (
  audioUri: string,
  mimeType = 'audio/m4a'
): Promise<string> => {
  openAiLog('Transcription start', { audioUri, mimeType });
  const apiKey = getOpenAiApiKey();
  const fileName = `voice.${mimeType.includes('wav') ? 'wav' : 'm4a'}`;

  const formData = new FormData();
  formData.append('model', OPENAI_TRANSCRIPTION_MODEL);

  if (isNodeRuntime()) {
    const audioResponse = await fetch(audioUri);
    if (!audioResponse.ok) {
      throw new Error('Unable to load voice recording for transcription.');
    }

    const audioBlob = await audioResponse.blob();
    formData.append('file', audioBlob, fileName);
  } else {
    formData.append('file', {
      uri: audioUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const rawBody = await response.text();
  openAiLog('Transcription response', {
    status: response.status,
    ok: response.ok,
    bodyPreview: rawBody.slice(0, 250),
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed (${response.status}): ${rawBody}`);
  }

  const parsed = rawBody ? (JSON.parse(rawBody) as OpenAITranscriptionResponse) : {};
  const transcript = typeof parsed.text === 'string' ? parsed.text.trim() : '';

  if (!transcript) {
    throw new Error('OpenAI transcription returned empty text.');
  }

  return transcript;
};

export const parseSpeechToReceiptWithOpenAI = async (
  transcript: string,
  roomMemberEmails: string[]
): Promise<VoiceReceiptParseResult> => {
  openAiLog('Speech parse start');
  const apiKey = getOpenAiApiKey();
  const normalizedMemberEmails = Array.from(
    new Set(
      roomMemberEmails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
    )
  );
  const allowedEmailSet = new Set(normalizedMemberEmails);

  const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_PARSE_MODEL,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'receipt_parse',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              companyName: { type: 'string' },
              totalAmount: { type: ['number', 'null'] },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'number' },
                    unitPrice: { type: 'number' },
                    lineTotal: { type: ['number', 'null'] },
                    purchasedFor: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          email: { type: 'string' },
                          quantity: { type: 'number' },
                        },
                        required: ['email', 'quantity'],
                      },
                    },
                  },
                  required: ['name', 'quantity', 'unitPrice', 'lineTotal', 'purchasedFor'],
                },
              },
            },
            required: ['companyName', 'totalAmount', 'items'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'Extract receipt-like structured data from spoken text. Use quantity and unitPrice per item. If missing, set sensible defaults: quantity=1, unitPrice=0, lineTotal=null. Also infer who each item was purchased for. Return purchasedFor as a list of {email, quantity}. Use only exact emails from the provided allowed-members list. If no valid member can be inferred for an item, return purchasedFor as an empty array.',
        },
        {
          role: 'user',
          content: transcript,
        },
        {
          role: 'user',
          content: `Allowed members (emails): ${normalizedMemberEmails.join(', ')}`,
        },
      ],
    }),
  });

  const rawBody = await response.text();
  openAiLog('Speech parse response', {
    status: response.status,
    ok: response.ok,
    bodyPreview: rawBody.slice(0, 250),
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech parse failed (${response.status}): ${rawBody}`);
  }

  const parsed = rawBody ? (JSON.parse(rawBody) as OpenAIChatResponse) : {};
  const content = parsed.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI speech parse returned empty content.');
  }

  const receipt = JSON.parse(content) as VoiceReceiptParseResult;

  return {
    companyName: typeof receipt.companyName === 'string' && receipt.companyName.trim()
      ? receipt.companyName.trim()
      : 'Voice Entry',
    totalAmount: typeof receipt.totalAmount === 'number' && Number.isFinite(receipt.totalAmount)
      ? receipt.totalAmount
      : null,
    items: Array.isArray(receipt.items)
      ? receipt.items
          .map((item, index) => ({
            name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Item ${index + 1}`,
            quantity:
              typeof item.quantity === 'number' && Number.isFinite(item.quantity)
                ? Math.max(1, Math.round(item.quantity))
                : 1,
            unitPrice:
              typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)
                ? Math.max(0, item.unitPrice)
                : 0,
            lineTotal:
              typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
                ? item.lineTotal
                : null,
            purchasedFor: Array.isArray(item.purchasedFor)
              ? item.purchasedFor
                  .map((assignee) => ({
                    email:
                      typeof assignee.email === 'string'
                        ? assignee.email.trim().toLowerCase()
                        : '',
                    quantity:
                      typeof assignee.quantity === 'number' && Number.isFinite(assignee.quantity)
                        ? Math.max(1, Math.round(assignee.quantity))
                        : 1,
                  }))
                  .filter((assignee) => assignee.email.length > 0 && allowedEmailSet.has(assignee.email))
                  .reduce<VoiceReceiptAssignee[]>((accumulator, assignee) => {
                    const existing = accumulator.find((entry) => entry.email === assignee.email);
                    if (existing) {
                      existing.quantity += assignee.quantity;
                    } else {
                      accumulator.push({ ...assignee });
                    }

                    return accumulator;
                  }, [])
              : [],
          }))
          .filter((item) => item.name.length > 0)
      : [],
  };
};

export const buildReceiptFromVoiceWithOpenAI = async (
  audioUri: string,
  mimeType = 'audio/m4a',
  roomMemberEmails: string[] = []
): Promise<VoiceReceiptResult> => {
  const transcript = await transcribeSpeechWithOpenAI(audioUri, mimeType);
  const receipt = await parseSpeechToReceiptWithOpenAI(transcript, roomMemberEmails);

  return {
    transcript,
    receipt,
  };
};

export const scanReceiptWithMindee = async (
  imageUri: string,
  mimeType = 'image/jpeg'
): Promise<ReceiptScanResult> => {
  mindeeLog('scanReceiptWithMindee invoked', {
    runtime: isNodeRuntime() ? 'node' : 'client',
    mimeType,
  });

  if (!isNodeRuntime()) {
    const result = await scanReceiptWithRawHttp(imageUri, mimeType);
    mindeeLog('scanReceiptWithMindee completed via HTTP path', {
      companyName: result.companyName,
      itemCount: result.items.length,
    });
    return result;
  }

  try {
    const result = await scanReceiptWithMindeeClient(imageUri, mimeType);
    mindeeLog('scanReceiptWithMindee completed via SDK path', {
      companyName: result.companyName,
      itemCount: result.items.length,
    });
    return result;
  } catch (error) {
    mindeeLog('SDK path failed, falling back to HTTP', {
      message: error instanceof Error ? error.message : String(error),
    });
    const result = await scanReceiptWithRawHttp(imageUri, mimeType);
    mindeeLog('scanReceiptWithMindee completed via HTTP fallback', {
      companyName: result.companyName,
      itemCount: result.items.length,
    });
    return result;
  }
};

export const register = async (payload: AuthRequest): Promise<RegisterResponse> => {
  const response = await api.post<RegisterResponse>('/auth/register', payload);
  return response.data;
};

export const login = async (payload: AuthRequest): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

export const protectedGet = async <T>(path: string): Promise<T> => {
  const response = await api.get<T>(path);
  return response.data;
};

export const listRooms = async (): Promise<ListRoomsResponse> => {
  const response = await api.get<ListRoomsResponse>('/rooms');
  return response.data;
};

export const createRoom = async (payload: { name: string }): Promise<CreateRoomResponse> => {
  const response = await api.post<CreateRoomResponse>('/rooms', payload);
  return response.data;
};

export const joinRoom = async (payload: { inviteCode: string }): Promise<JoinRoomResponse> => {
  const response = await api.post<JoinRoomResponse>('/rooms/join', payload);
  return response.data;
};

export const listRoomMembers = async (roomId: string): Promise<ListRoomMembersResponse> => {
  const response = await api.get<ListRoomMembersResponse>(`/rooms/${roomId}/members`);
  return response.data;
};

export const listRoomTransactions = async (
  roomId: string
): Promise<ListRoomTransactionsResponse> => {
  const response = await api.get<ListRoomTransactionsResponse>(`/rooms/${roomId}/transactions`);
  return response.data;
};

export const createRoomTransaction = async (
  roomId: string,
  payload: CreateRoomTransactionPayload
): Promise<CreateRoomTransactionResponse> => {
  const response = await api.post<CreateRoomTransactionResponse>(
    `/rooms/${roomId}/transactions`,
    payload
  );
  return response.data;
};

export const updateRoomTransaction = async (
  roomId: string,
  transactionId: string,
  payload: UpdateRoomTransactionPayload
): Promise<UpdateRoomTransactionResponse> => {
  const response = await api.patch<UpdateRoomTransactionResponse>(
    `/rooms/${roomId}/transactions/${transactionId}`,
    payload
  );
  return response.data;
};

export const deleteRoomTransaction = async (
  roomId: string,
  transactionId: string
): Promise<DeleteRoomTransactionResponse> => {
  const response = await api.delete<DeleteRoomTransactionResponse>(
    `/rooms/${roomId}/transactions/${transactionId}`
  );
  return response.data;
};

export const takeRoomTransactionItem = async (
  roomId: string,
  transactionId: string,
  itemId: string,
  payload: TakeItemPayload
): Promise<TakeItemResponse> => {
  const response = await api.post<TakeItemResponse>(
    `/rooms/${roomId}/transactions/${transactionId}/items/${itemId}/take`,
    payload
  );
  return response.data;
};

export const assignRoomTransactionItem = async (
  roomId: string,
  transactionId: string,
  itemId: string,
  payload: AssignItemPayload
): Promise<AssignItemResponse> => {
  const response = await api.post<AssignItemResponse>(
    `/rooms/${roomId}/transactions/${transactionId}/items/${itemId}/assign`,
    payload
  );
  return response.data;
};

export default api;
