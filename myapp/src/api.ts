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

const MINDEE_RECEIPT_PREDICT_URL =
  'https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict';
const MINDEE_API_TOKEN = 'md__vAPz2zzXhPUYCyX2kk_W8lvH_6rOOBXUsrIMmWE0Ic';

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

const parseFieldValue = (field: unknown): unknown => {
  if (!field || typeof field !== 'object') {
    return field;
  }

  if ('value' in field) {
    return (field as { value: unknown }).value;
  }

  return field;
};

const toPositiveInt = (value: number | null, fallback = 1): number => {
  if (value === null) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
};

export const scanReceiptWithMindee = async (
  imageUri: string,
  mimeType = 'image/jpeg'
): Promise<ReceiptScanResult> => {
  const formData = new FormData();
  formData.append('document', {
    uri: imageUri,
    name: `receipt.${mimeType.includes('png') ? 'png' : 'jpg'}`,
    type: mimeType,
  } as unknown as Blob);

  const response = await axios.post(MINDEE_RECEIPT_PREDICT_URL, formData, {
    headers: {
      Authorization: `Token ${MINDEE_API_TOKEN}`,
      'Content-Type': 'multipart/form-data',
    },
    timeout: 25000,
  });

  const prediction =
    (response.data as { document?: { inference?: { prediction?: Record<string, unknown> } } }).document
      ?.inference?.prediction ?? {};

  const supplierName = parseFieldValue(prediction.supplier_name);
  const companyName = typeof supplierName === 'string' && supplierName.trim().length > 0
    ? supplierName.trim()
    : 'Receipt';

  const totalAmount = parseNumber(parseFieldValue(prediction.total_amount));

  const rawLineItems = Array.isArray(prediction.line_items)
    ? (prediction.line_items as Array<Record<string, unknown>>)
    : [];

  const items: ReceiptScanItem[] = rawLineItems
    .map((lineItem, index) => {
      const parsedName = parseFieldValue(lineItem.description) ?? parseFieldValue(lineItem.product_name);
      const parsedQuantity = parseNumber(parseFieldValue(lineItem.quantity));
      const parsedUnitPrice = parseNumber(parseFieldValue(lineItem.unit_price));
      const parsedLineTotal = parseNumber(parseFieldValue(lineItem.total_amount));

      const quantity = toPositiveInt(parsedQuantity, 1);
      const unitPrice =
        parsedUnitPrice ??
        (parsedLineTotal !== null && quantity > 0 ? parsedLineTotal / quantity : 0);

      return {
        name:
          typeof parsedName === 'string' && parsedName.trim().length > 0
            ? parsedName.trim()
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
