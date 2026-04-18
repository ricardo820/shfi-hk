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

const MINDEE_V2_BASE_URL = 'https://api-v2.mindee.net';
const MINDEE_RECEIPT_MODEL_ID = 'mindee/expense_receipts/v5';
const MINDEE_API_TOKEN = 'md__vAPz2zzXhPUYCyX2kk_W8lvH_6rOOBXUsrIMmWE0Ic';

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
    v1: {
      Client: new (options: { apiKey: string }) => {
        parse: (
          productClass: unknown,
          inputSource: unknown
        ) => Promise<unknown>;
      };
    };
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
      modelId: MINDEE_RECEIPT_MODEL_ID,
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

  return mapV2ResponseToReceiptResult(rawResponse);
};

const scanReceiptWithRawHttp = async (
  imageUri: string,
  mimeType: string
): Promise<ReceiptScanResult> => {
  const formData = new FormData();
  formData.append('model_id', MINDEE_RECEIPT_MODEL_ID);
  formData.append('file', {
    uri: imageUri,
    name: `receipt.${mimeType.includes('png') ? 'png' : 'jpg'}`,
    type: mimeType,
  } as unknown as Blob);

  const enqueueResponse = await axios.post<MindeeV2ExtractionResponse>(
    `${MINDEE_V2_BASE_URL}/v2/products/extraction/enqueue`,
    formData,
    {
      headers: {
        Authorization: MINDEE_API_TOKEN,
        'Content-Type': 'multipart/form-data',
      },
      timeout: 25000,
    }
  );

  let resultUrl = enqueueResponse.data.job?.result_url;
  let pollingUrl = enqueueResponse.data.job?.polling_url;

  for (let attempt = 0; attempt < 45 && !resultUrl; attempt += 1) {
    if (!pollingUrl) {
      break;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const pollResponse = await axios.get<MindeeV2ExtractionResponse>(resolveMindeeV2Url(pollingUrl), {
      headers: {
        Authorization: MINDEE_API_TOKEN,
      },
      timeout: 25000,
    });

    if (pollResponse.data.job?.error) {
      throw new Error(
        pollResponse.data.job.error.detail ||
          pollResponse.data.job.error.title ||
          'Mindee failed to process this receipt.'
      );
    }

    resultUrl = pollResponse.data.job?.result_url ?? resultUrl;
    pollingUrl = pollResponse.data.job?.polling_url ?? pollingUrl;
  }

  if (!resultUrl) {
    throw new Error('Mindee did not return a result URL for receipt extraction.');
  }

  const resultResponse = await axios.get<MindeeV2ExtractionResponse>(resolveMindeeV2Url(resultUrl), {
    headers: {
      Authorization: MINDEE_API_TOKEN,
    },
    timeout: 25000,
  });

  return mapV2ResponseToReceiptResult(resultResponse.data);
};

export const scanReceiptWithMindee = async (
  imageUri: string,
  mimeType = 'image/jpeg'
): Promise<ReceiptScanResult> => {
  try {
    return await scanReceiptWithMindeeClient(imageUri, mimeType);
  } catch {
    return scanReceiptWithRawHttp(imageUri, mimeType);
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
