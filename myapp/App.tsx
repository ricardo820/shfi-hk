import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import QRCode from 'react-native-qrcode-svg';
import axios from 'axios';
import {
  buildReceiptFromVoiceWithOpenAI,
  createRoom,
  createRoomTransaction,
  deleteRoomTransaction,
  joinRoom,
  listRoomMembers,
  listRooms,
  listRoomTransactions,
  login,
  register,
  Room,
  RoomMemberEntry,
  ReceiptScanResult,
  RoomTransaction,
  assignRoomTransactionItem,
  scanReceiptWithMindee,
  setAuthToken,
  takeRoomTransactionItem,
  updateRoomTransaction,
  User,
} from './src/api';

type AuthMode = 'login' | 'register';

type TransactionFormItem = {
  itemName: string;
  itemCount: string;
  unitPrice: string;
  allocations: Record<string, string>;
};

type VoiceAssignee = {
  email: string;
  quantity: number;
};

type VoiceAwareReceiptItem = ReceiptScanResult['items'][number] & {
  purchasedFor?: VoiceAssignee[];
};

type VoiceAwareReceipt = Omit<ReceiptScanResult, 'items'> & {
  items: VoiceAwareReceiptItem[];
};

type SettlementTransfer = {
  debtorId: string;
  creditorId: string;
  amount: number;
};

const STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
};

type NavItemKey = 'home' | 'settings';

function BottomNavBar({
  activeKey,
  onSelect,
}: {
  activeKey: NavItemKey;
  onSelect: (key: NavItemKey) => void;
}) {
  return (
    <View style={styles.bottomNavShell}>
      <Pressable
        style={({ pressed }) => [
          styles.navItem,
          pressed && styles.navItemPressed,
        ]}
        onPress={() => onSelect('home')}
      >
        <MaterialIcons
          name="home"
          size={24}
          color={activeKey === 'home' ? '#E5E2E3' : '#737373'}
        />
        <Text style={[styles.navLabel, activeKey === 'home' ? styles.navLabelActive : styles.navLabelInactive]}>HOME</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.navItem,
          pressed && styles.navItemPressed,
        ]}
        onPress={() => onSelect('settings')}
      >
        <MaterialIcons
          name="settings"
          size={24}
          color={activeKey === 'settings' ? '#E5E2E3' : '#737373'}
        />
        <Text style={[styles.navLabel, activeKey === 'settings' ? styles.navLabelActive : styles.navLabelInactive]}>SETTINGS</Text>
      </Pressable>
    </View>
  );
}

function TopNavBar({ user }: { user: User | null }) {
  const getFirstName = (email: string) => {
    const namePart = email.split('@')[0].split(/[._-]/)[0];
    if (!namePart) return 'USER';
    return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
  };
  const displayName = user ? getFirstName(user.email) : 'SHFI';

  return (
    <View style={styles.topNavShell}>
      <View style={styles.topNavLeft}>
        <Pressable style={({ pressed }) => [pressed && styles.navItemPressed]}>
          <MaterialIcons name="mail" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.topNavCenter}>
        <Image
          source={require('./assets/icon.png')}
          style={styles.topNavProfileImage}
        />
      </View>
      <View style={styles.topNavRight}>
        <Text style={styles.topNavLogoText}>{displayName}</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');
  const [roomStatusMessage, setRoomStatusMessage] = useState('');
  const [isAddRoomModalVisible, setAddRoomModalVisible] = useState(false);
  const [isCreateRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [isJoinScannerVisible, setJoinScannerVisible] = useState(false);
  const [createRoomName, setCreateRoomName] = useState('');
  const [roomActionLoading, setRoomActionLoading] = useState(false);
  const [hasProcessedScan, setHasProcessedScan] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [openedRoom, setOpenedRoom] = useState<Room | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMemberEntry[]>([]);
  const [roomTransactions, setRoomTransactions] = useState<RoomTransaction[]>([]);
  const [roomDetailsLoading, setRoomDetailsLoading] = useState(false);
  const [roomDetailsError, setRoomDetailsError] = useState('');
  const [roomDetailsStatus, setRoomDetailsStatus] = useState('');
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [isInviteModalVisible, setInviteModalVisible] = useState(false);
  const [isAddTransactionModalVisible, setAddTransactionModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<RoomTransaction | null>(null);
  const [transactionCompanyName, setTransactionCompanyName] = useState('');
  const [transactionItems, setTransactionItems] = useState<TransactionFormItem[]>([
    {
      itemName: '',
      itemCount: '1',
      unitPrice: '0',
      allocations: {},
    },
  ]);
  const [activeNav, setActiveNav] = useState<NavItemKey>('home');
  const [isLiveReceiptScannerVisible, setLiveReceiptScannerVisible] = useState(false);
  const [isLiveReceiptScanning, setLiveReceiptScanning] = useState(false);
  const [isLiveReceiptProcessing, setLiveReceiptProcessing] = useState(false);
  const [liveReceiptStatus, setLiveReceiptStatus] = useState('');
  const [isVoiceModalVisible, setVoiceModalVisible] = useState(false);
  const [isVoiceRecording, setVoiceRecording] = useState(false);
  const [isVoiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [settleLoadingRoomId, setSettleLoadingRoomId] = useState<string | null>(null);
  const [settleAllLoading, setSettleAllLoading] = useState(false);
  const [isPaymentGateVisible, setPaymentGateVisible] = useState(false);
  const [paymentGateAmount, setPaymentGateAmount] = useState(0);
  const [paymentGateContext, setPaymentGateContext] = useState('');
  const liveReceiptCameraRef = useRef<CameraView | null>(null);
  const liveReceiptScanInFlightRef = useRef(false);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
  const paymentGateResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const getDefaultAllocations = () =>
    Object.fromEntries(roomMembers.map((member) => [String(member.user.id), '0']));

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [tokenValue, userValue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.user),
        ]);

        if (tokenValue && userValue) {
          const parsedUser = JSON.parse(userValue) as User;
          setAuthToken(tokenValue);
          setAuthenticatedUser(parsedUser);
          setActiveNav('home');
        }
      } catch {
        setAuthToken(null);
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.token),
          AsyncStorage.removeItem(STORAGE_KEYS.user),
        ]);
      } finally {
        setRestoringSession(false);
      }
    };

    void restoreSession();
  }, []);

  const primaryButtonLabel = useMemo(
    () => (mode === 'login' ? 'Sign In' : 'Register'),
    [mode]
  );

  const secondaryButtonLabel = useMemo(
    () => (mode === 'login' ? 'Switch to Register' : 'Switch to Sign In'),
    [mode]
  );

  const fetchRooms = async () => {
    try {
      setRoomsLoading(true);
      setRoomsError('');
      const response = await listRooms();
      setRooms(response.rooms ?? []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to load rooms right now.';
        setRoomsError(message);
      } else {
        setRoomsError('Unable to load rooms right now.');
      }
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    if (authenticatedUser) {
      void fetchRooms();
    }
  }, [authenticatedUser]);

  const fetchRoomDetails = async (room: Room) => {
    try {
      setRoomDetailsLoading(true);
      setRoomDetailsError('');
      const [membersResponse, transactionsResponse] = await Promise.all([
        listRoomMembers(room.id),
        listRoomTransactions(room.id),
      ]);
      setRoomMembers(membersResponse.members ?? []);
      const txs = transactionsResponse.transactions ?? [];
      setRoomTransactions(txs);
      setMembersExpanded(txs.length === 0);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to load room details right now.';
        setRoomDetailsError(message);
      } else {
        setRoomDetailsError('Unable to load room details right now.');
      }
    } finally {
      setRoomDetailsLoading(false);
    }
  };

  const openRoom = async (room: Room) => {
    setActiveNav('home');
    setOpenedRoom(room);
    setRoomDetailsStatus('');
    await fetchRoomDetails(room);
  };

  const handleLogout = () => {
    setAuthToken(null);
    void Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.token),
      AsyncStorage.removeItem(STORAGE_KEYS.user),
    ]);
    setAuthenticatedUser(null);
    setOpenedRoom(null);
    setActiveNav('home');
    setEmail('');
    setPassword('');
    setAuthError('');
    setStatusMessage('');
    setRoomDetailsError('');
    setRoomDetailsStatus('');
    setMode('login');
  };

  const onNavSelect = (key: NavItemKey) => {
    if (key === 'home') {
      setActiveNav('home');
      setOpenedRoom(null);
      setRoomDetailsError('');
      setRoomDetailsStatus('');
      return;
    }

    if (key === 'settings') {
      setActiveNav('settings');
      setOpenedRoom(null);
      return;
    }

    if (key !== 'add') {
      setActiveNav(key);
    }
  };

  const resetTransactionForm = () => {
    const defaultAllocations = getDefaultAllocations();

    setEditingTransaction(null);
    setTransactionCompanyName('');
    setTransactionItems([
      {
        itemName: '',
        itemCount: '1',
        unitPrice: '0',
        allocations: defaultAllocations,
      },
    ]);
  };

  const openCreateTransactionModal = () => {
    resetTransactionForm();
    setAddTransactionModalVisible(true);
  };

  const openEditTransactionModal = (transaction: RoomTransaction) => {
    const allMemberIds = roomMembers.map((member) => String(member.user.id));

    setEditingTransaction(transaction);
    setTransactionCompanyName(transaction.companyName);
    setTransactionItems(
      transaction.items.map((item) => ({
        itemName: item.itemName,
        itemCount: String(item.itemCount),
        unitPrice: String(item.unitPrice),
        allocations: allMemberIds.reduce<Record<string, string>>((accumulator, memberId) => {
          const assignedQuantity = (item.taken?.takenBy ?? [])
            .filter((entry) => String(entry.userId) === memberId)
            .reduce((sum, entry) => sum + entry.quantity, 0);

          accumulator[memberId] = String(assignedQuantity);
          return accumulator;
        }, {}),
      }))
    );
    setAddTransactionModalVisible(true);
  };

  const updateTransactionItem = (
    index: number,
    field: keyof TransactionFormItem,
    value: string
  ) => {
    let normalizedValue = value;
    if (field === 'unitPrice') {
      normalizedValue = value.replace(',', '.');
    }

    setTransactionItems((previousItems) =>
      previousItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
            ...item,
            [field]: normalizedValue,
          }
          : item
      )
    );
  };

  const addTransactionItemRow = () => {
    const defaultAllocations = getDefaultAllocations();

    setTransactionItems((previousItems) => [
      ...previousItems,
      {
        itemName: '',
        itemCount: '1',
        unitPrice: '0',
        allocations: defaultAllocations,
      },
    ]);
  };

  const fillTransactionFromReceipt = (parsedReceipt: VoiceAwareReceipt) => {
    const defaultAllocations = getDefaultAllocations();
    const memberIdByEmail = new Map(
      roomMembers.map((member) => [member.user.email.trim().toLowerCase(), String(member.user.id)])
    );
    const parsedItems =
      parsedReceipt.items.length > 0
        ? parsedReceipt.items.map((item) => {
          const itemCount = Math.max(1, item.quantity);
          const allocations = { ...defaultAllocations };

          if (Array.isArray(item.purchasedFor) && item.purchasedFor.length > 0) {
            let remaining = itemCount;

            item.purchasedFor.forEach((assignee) => {
              if (remaining <= 0) {
                return;
              }

              const normalizedEmail = assignee.email.trim().toLowerCase();
              const memberId = memberIdByEmail.get(normalizedEmail);

              if (!memberId) {
                return;
              }

              const requestedQuantity =
                Number.isFinite(assignee.quantity) && assignee.quantity > 0
                  ? Math.max(1, Math.round(assignee.quantity))
                  : 1;
              const acceptedQuantity = Math.min(requestedQuantity, remaining);
              const current = Number(allocations[memberId] ?? '0');
              allocations[memberId] = String(
                (Number.isFinite(current) ? current : 0) + acceptedQuantity
              );
              remaining -= acceptedQuantity;
            });
          }

          return {
            itemName: item.name,
            itemCount: String(itemCount),
            unitPrice: String(item.unitPrice),
            allocations,
          };
        })
        : [
          {
            itemName: 'Receipt Total',
            itemCount: '1',
            unitPrice: String(Math.max(0, parsedReceipt.totalAmount ?? 0)),
            allocations: { ...defaultAllocations },
          },
        ];

    setEditingTransaction(null);
    setTransactionCompanyName(parsedReceipt.companyName || 'Receipt');
    setTransactionItems(parsedItems);
    setAddTransactionModalVisible(true);
  };


  const openLiveReceiptScanner = async () => {
    setRoomDetailsError('');
    setRoomDetailsStatus('');

    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        setRoomDetailsError('Camera permission is required to scan receipt in real time.');
        return;
      }
    }

    setLiveReceiptStatus('Point at the receipt and press Start live scan.');
    setLiveReceiptScanning(false);
    setLiveReceiptProcessing(false);
    setLiveReceiptScannerVisible(true);
  };

  const closeLiveReceiptScanner = () => {
    setLiveReceiptScanning(false);
    setLiveReceiptProcessing(false);
    setLiveReceiptScannerVisible(false);
    setLiveReceiptStatus('');
  };

  const resetVoiceCaptureState = () => {
    setVoiceRecording(false);
    setVoiceProcessing(false);
    setVoiceStatus('');
    setVoiceTranscript('');
  };

  const openVoiceTransactionModal = () => {
    setRoomDetailsError('');
    setRoomDetailsStatus('');
    resetVoiceCaptureState();
    setVoiceStatus('Tap Start Recording and describe your receipt.');
    setVoiceModalVisible(true);
  };

  const closeVoiceTransactionModal = () => {
    if (isVoiceRecording || isVoiceProcessing) {
      return;
    }

    setVoiceModalVisible(false);
    resetVoiceCaptureState();
  };

  const startVoiceRecording = async () => {
    if (isVoiceRecording || isVoiceProcessing) {
      return;
    }

    try {
      const permissionResult = await Audio.requestPermissionsAsync();
      if (!permissionResult.granted) {
        setVoiceStatus('Microphone permission is required for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      voiceRecordingRef.current = recording;
      setVoiceRecording(true);
      setVoiceStatus('Recording… Tap Stop to process your voice input.');
      setVoiceTranscript('');
    } catch {
      setVoiceStatus('Unable to start recording. Please try again.');
    }
  };

  const stopVoiceRecordingAndParse = async () => {
    if (isVoiceProcessing) {
      return;
    }

    const recording = voiceRecordingRef.current;
    if (!recording) {
      setVoiceStatus('No active recording found.');
      return;
    }

    try {
      setVoiceRecording(false);
      setVoiceProcessing(true);
      setVoiceStatus('Transcribing and parsing receipt details…');

      await recording.stopAndUnloadAsync();
      voiceRecordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const recordingUri = recording.getURI();
      if (!recordingUri) {
        throw new Error('Voice recording URI is unavailable.');
      }

      const parsed = await buildReceiptFromVoiceWithOpenAI(
        recordingUri,
        'audio/m4a',
        roomMembers.map((member) => member.user.email)
      );
      const hasDetectedItems = parsed.receipt.items.length > 0;
      const hasDetectedTotal =
        typeof parsed.receipt.totalAmount === 'number' && parsed.receipt.totalAmount > 0;

      if (!hasDetectedItems && !hasDetectedTotal) {
        setVoiceStatus('No receipt data detected in your speech. Please try again.');
        return;
      }

      setVoiceTranscript(parsed.transcript);
      fillTransactionFromReceipt(parsed.receipt);
      const inferredAssignments = parsed.receipt.items.reduce(
        (sum, item) => sum + (Array.isArray(item.purchasedFor) ? item.purchasedFor.length : 0),
        0
      );
      setRoomDetailsStatus(
        inferredAssignments > 0
          ? 'Voice parsed. Item assignees were inferred from member emails; review and save transaction.'
          : 'Voice parsed. Review parsed items and save transaction.'
      );
      setVoiceStatus('Parsed successfully. Opening transaction form…');
      setVoiceModalVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process voice input.';
      setVoiceStatus(message);
      setRoomDetailsError('Unable to process voice input right now.');
      voiceRecordingRef.current = null;
    } finally {
      setVoiceRecording(false);
      setVoiceProcessing(false);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    }
  };

  const scanLiveReceiptFrame = async () => {
    if (
      !isLiveReceiptScannerVisible ||
      !isLiveReceiptScanning ||
      isLiveReceiptProcessing ||
      liveReceiptScanInFlightRef.current
    ) {
      return;
    }

    const camera = liveReceiptCameraRef.current;
    if (!camera) {
      return;
    }

    liveReceiptScanInFlightRef.current = true;

    try {
      console.info('[ReceiptScan] Live frame scan started');
      setLiveReceiptStatus('Scanning receipt…');
      const picture = await camera.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });

      if (!picture?.uri) {
        setLiveReceiptStatus('No frame captured. Keep camera steady and try again.');
        return;
      }

      setLiveReceiptScanning(false);
      setLiveReceiptProcessing(true);
      setLiveReceiptStatus('Receipt captured. Processing…');

      const parsedReceipt = await scanReceiptWithMindee(picture.uri, 'image/jpeg');
      console.info('[ReceiptScan] Live frame scan completed', {
        companyName: parsedReceipt.companyName,
        itemCount: parsedReceipt.items.length,
        totalAmount: parsedReceipt.totalAmount,
      });
      const hasDetectedItems = parsedReceipt.items.length > 0;
      const hasDetectedTotal = typeof parsedReceipt.totalAmount === 'number' && parsedReceipt.totalAmount > 0;

      if (!hasDetectedItems && !hasDetectedTotal) {
        setLiveReceiptStatus('No receipt data detected. Press Start to scan again.');
        return;
      }

      fillTransactionFromReceipt(parsedReceipt);
      setLiveReceiptStatus('Receipt detected. Transaction form pre-filled.');
      setRoomDetailsStatus('Receipt scanned in real time. Review parsed items and save transaction.');
      setLiveReceiptScanning(false);
      setLiveReceiptScannerVisible(false);
    } catch (error) {
      console.error('[ReceiptScan] Live frame scan failed', {
        isAxiosError: axios.isAxiosError(error),
        message: error instanceof Error ? error.message : String(error),
        axiosStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
        axiosData: axios.isAxiosError(error) ? error.response?.data : undefined,
      });
      setLiveReceiptStatus('Processing failed. Press Start to scan again.');
    } finally {
      setLiveReceiptProcessing(false);
      liveReceiptScanInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!isLiveReceiptScannerVisible || !isLiveReceiptScanning) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const runLoop = async () => {
      if (cancelled) {
        return;
      }

      await scanLiveReceiptFrame();

      if (!cancelled && isLiveReceiptScannerVisible && isLiveReceiptScanning) {
        timer = setTimeout(runLoop, 2500);
      }
    };

    void runLoop();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isLiveReceiptScannerVisible, isLiveReceiptScanning]);

  useEffect(() => {
    if (!isLiveReceiptScannerVisible) {
      liveReceiptScanInFlightRef.current = false;
    }
  }, [isLiveReceiptScannerVisible]);

  useEffect(() => {
    return () => {
      const recording = voiceRecordingRef.current;
      if (recording) {
        void recording.stopAndUnloadAsync();
        voiceRecordingRef.current = null;
      }

      if (paymentGateResolverRef.current) {
        paymentGateResolverRef.current(false);
        paymentGateResolverRef.current = null;
      }
    };
  }, []);

  const updateTransactionAllocation = (itemIndex: number, userId: string, value: string) => {
    setTransactionItems((previousItems) =>
      previousItems.map((item, index) =>
        index === itemIndex
          ? {
            ...item,
            allocations: {
              ...item.allocations,
              [userId]: value,
            },
          }
          : item
      )
    );
  };

  const removeTransactionItemRow = (index: number) => {
    setTransactionItems((previousItems) => {
      if (previousItems.length === 1) {
        return previousItems;
      }

      return previousItems.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const buildSettlementTransfers = (
    transactions: RoomTransaction[],
    memberIds: string[]
  ): SettlementTransfer[] => {
    const rawLedger = new Map<string, Map<string, number>>();

    const getEdgeAmount = (debtorId: string, creditorId: string): number => {
      return rawLedger.get(debtorId)?.get(creditorId) ?? 0;
    };

    const setEdgeAmount = (debtorId: string, creditorId: string, amount: number) => {
      if (amount <= 0) {
        const debtorEdges = rawLedger.get(debtorId);
        if (!debtorEdges) {
          return;
        }

        debtorEdges.delete(creditorId);
        if (debtorEdges.size === 0) {
          rawLedger.delete(debtorId);
        }
        return;
      }

      const debtorEdges = rawLedger.get(debtorId) ?? new Map<string, number>();
      debtorEdges.set(creditorId, amount);
      rawLedger.set(debtorId, debtorEdges);
    };

    const addDebt = (debtorId: string, creditorId: string, amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0 || debtorId === creditorId) {
        return;
      }

      setEdgeAmount(debtorId, creditorId, getEdgeAmount(debtorId, creditorId) + amount);
    };

    transactions.forEach((transaction) => {
      const ownerUserId = String(transaction.owner.userId);

      transaction.items.forEach((item) => {
        if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
          return;
        }

        const takenBy = item.taken?.takenBy ?? [];

        takenBy.forEach((entry) => {
          if (!Number.isFinite(entry.quantity) || entry.quantity <= 0) {
            return;
          }

          addDebt(String(entry.userId), ownerUserId, entry.quantity * item.unitPrice);
        });

        const allocatedQuantity = takenBy.reduce(
          (sum, entry) => sum + (Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0),
          0
        );

        const computedRemaining = item.itemCount - allocatedQuantity;
        const remainingCount =
          item.taken && Number.isFinite(item.taken.remainingCount)
            ? Math.max(0, item.taken.remainingCount)
            : Math.max(0, computedRemaining);

        if (remainingCount <= 0) {
          return;
        }

        const participants = memberIds.length > 0 ? memberIds : [ownerUserId];
        const participantCount = Math.max(participants.length, 1);
        const communalShare = (remainingCount * item.unitPrice) / participantCount;

        participants.forEach((participantId) => {
          addDebt(participantId, ownerUserId, communalShare);
        });
      });
    });

    const balanceByUser = new Map<string, number>();

    const adjustBalance = (userId: string, amount: number) => {
      if (!Number.isFinite(amount) || amount === 0) {
        return;
      }

      balanceByUser.set(userId, (balanceByUser.get(userId) ?? 0) + amount);
    };

    rawLedger.forEach((creditors, debtorId) => {
      creditors.forEach((amount, creditorId) => {
        if (!Number.isFinite(amount) || amount <= 0 || debtorId === creditorId) {
          return;
        }

        adjustBalance(debtorId, -amount);
        adjustBalance(creditorId, amount);
      });
    });

    memberIds.forEach((memberId) => {
      if (!balanceByUser.has(memberId)) {
        balanceByUser.set(memberId, 0);
      }
    });

    const debtors = Array.from(balanceByUser.entries())
      .filter(([, balance]) => balance < -1e-9)
      .map(([userId, balance]) => ({ userId, amount: -balance }));

    const creditors = Array.from(balanceByUser.entries())
      .filter(([, balance]) => balance > 1e-9)
      .map(([userId, balance]) => ({ userId, amount: balance }));

    const transfers: SettlementTransfer[] = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const settledAmount = Math.min(debtor.amount, creditor.amount);

      if (settledAmount > 1e-9 && debtor.userId !== creditor.userId) {
        transfers.push({
          debtorId: debtor.userId,
          creditorId: creditor.userId,
          amount: settledAmount,
        });
      }

      debtor.amount -= settledAmount;
      creditor.amount -= settledAmount;

      if (debtor.amount <= 1e-9) {
        debtorIndex += 1;
      }

      if (creditor.amount <= 1e-9) {
        creditorIndex += 1;
      }
    }

    return transfers;
  };

  const requestDummyPaymentGate = (totalAmount: number, contextLabel: string): Promise<boolean> => {
    setPaymentGateAmount(Math.max(0, totalAmount));
    setPaymentGateContext(contextLabel);
    setPaymentGateVisible(true);

    return new Promise((resolve) => {
      paymentGateResolverRef.current = resolve;
    });
  };

  const resolveDummyPaymentGate = (confirmed: boolean) => {
    setPaymentGateVisible(false);
    const resolver = paymentGateResolverRef.current;
    paymentGateResolverRef.current = null;
    resolver?.(confirmed);
  };

  const applySettlementTransactionsForRoom = async (
    roomId: string,
    currentUserTransfers: SettlementTransfer[],
    memberEmailById: Map<string, string>
  ) => {
    if (!authenticatedUser) {
      return;
    }

    for (const transfer of currentUserTransfers) {
      const creditorUserId = Number(transfer.creditorId);
      if (!Number.isFinite(creditorUserId)) {
        continue;
      }

      const creditorEmail = memberEmailById.get(transfer.creditorId) ?? `User ${transfer.creditorId}`;
      const amount = Number(transfer.amount.toFixed(2));

      const created = await createRoomTransaction(roomId, {
        companyName: 'Debt Settlement',
        ownerUserId: authenticatedUser.id,
        items: [
          {
            itemName: `Settlement payment to ${creditorEmail}`,
            itemCount: 1,
            unitPrice: amount,
          },
        ],
      });

      const settlementItemId = created.transaction.items[0]?.id;
      if (!settlementItemId) {
        continue;
      }

      await assignRoomTransactionItem(roomId, created.transaction.id, settlementItemId, {
        userId: creditorUserId,
        quantity: 1,
      });
    }
  };

  const settleRoomDebt = async (room: Room, skipPaymentGate = false) => {
    if (!authenticatedUser) {
      return;
    }

    try {
      setRoomsError('');
      setRoomStatusMessage('');
      setSettleLoadingRoomId(room.id);

      const [membersResponse, transactionsResponse] = await Promise.all([
        listRoomMembers(room.id),
        listRoomTransactions(room.id),
      ]);

      const members = membersResponse.members ?? [];
      const transactions = transactionsResponse.transactions ?? [];
      const memberIds = members.map((member) => String(member.user.id));
      const memberEmailById = new Map(
        members.map((member) => [String(member.user.id), member.user.email])
      );

      const transfers = buildSettlementTransfers(transactions, memberIds);
      const currentUserTransfers = transfers.filter(
        (transfer) => transfer.debtorId === String(authenticatedUser.id)
      );

      const totalToPay = currentUserTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

      if (totalToPay <= 1e-9) {
        setRoomStatusMessage(`Nothing to settle for ${room.name}.`);
        return;
      }

      if (!skipPaymentGate) {
        const paymentConfirmed = await requestDummyPaymentGate(totalToPay, `Settle ${room.name}`);
        if (!paymentConfirmed) {
          setRoomStatusMessage(`Settlement cancelled for ${room.name}.`);
          return;
        }
      }

      await applySettlementTransactionsForRoom(room.id, currentUserTransfers, memberEmailById);

      if (openedRoom?.id === room.id) {
        await fetchRoomDetails(room);
      }

      setRoomStatusMessage(`Settled ${room.name} for $${totalToPay.toFixed(2)}.`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : `Unable to settle ${room.name} right now.`;
        setRoomsError(message);
      } else {
        setRoomsError(`Unable to settle ${room.name} right now.`);
      }
    } finally {
      setSettleLoadingRoomId(null);
      await fetchRooms();
    }
  };

  const settleAllRoomsDebt = async () => {
    if (!authenticatedUser || rooms.length === 0) {
      return;
    }

    try {
      setRoomsError('');
      setRoomStatusMessage('');
      setSettleAllLoading(true);

      const roomSettlementInputs = await Promise.all(
        rooms.map(async (room) => {
          const [membersResponse, transactionsResponse] = await Promise.all([
            listRoomMembers(room.id),
            listRoomTransactions(room.id),
          ]);

          const members = membersResponse.members ?? [];
          const transactions = transactionsResponse.transactions ?? [];
          const memberIds = members.map((member) => String(member.user.id));
          const memberEmailById = new Map(
            members.map((member) => [String(member.user.id), member.user.email])
          );
          const transfers = buildSettlementTransfers(transactions, memberIds);
          const currentUserTransfers = transfers.filter(
            (transfer) => transfer.debtorId === String(authenticatedUser.id)
          );

          return {
            room,
            memberEmailById,
            currentUserTransfers,
            totalToPay: currentUserTransfers.reduce((sum, transfer) => sum + transfer.amount, 0),
          };
        })
      );

      const payableRooms = roomSettlementInputs.filter((input) => input.totalToPay > 1e-9);
      const totalToPay = payableRooms.reduce((sum, input) => sum + input.totalToPay, 0);

      if (totalToPay <= 1e-9) {
        setRoomStatusMessage('Nothing to settle across your rooms.');
        return;
      }

      const paymentConfirmed = await requestDummyPaymentGate(totalToPay, 'Settle all rooms');
      if (!paymentConfirmed) {
        setRoomStatusMessage('Settle all cancelled.');
        return;
      }

      for (const roomInput of payableRooms) {
        await applySettlementTransactionsForRoom(
          roomInput.room.id,
          roomInput.currentUserTransfers,
          roomInput.memberEmailById
        );
      }

      if (openedRoom) {
        const refreshedRoom = rooms.find((room) => room.id === openedRoom.id) ?? openedRoom;
        await fetchRoomDetails(refreshedRoom);
      }

      setRoomStatusMessage(`Settled all rooms for $${totalToPay.toFixed(2)}.`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to settle all rooms right now.';
        setRoomsError(message);
      } else {
        setRoomsError('Unable to settle all rooms right now.');
      }
    } finally {
      setSettleAllLoading(false);
      await fetchRooms();
    }
  };

  const computeRoomDebt = () => {
    if (!authenticatedUser) {
      return {
        userDebt: 0,
        owedToUser: 0,
      };
    }

    const currentUserId = String(authenticatedUser.id);
    const roomMemberIds = Array.from(new Set(roomMembers.map((member) => String(member.user.id))));
    const transfers = buildSettlementTransfers(roomTransactions, roomMemberIds);

    const userDebt = transfers
      .filter((transfer) => transfer.debtorId === currentUserId && transfer.creditorId !== currentUserId)
      .reduce((sum, transfer) => sum + transfer.amount, 0);

    const owedToUser = transfers
      .filter((transfer) => transfer.creditorId === currentUserId && transfer.debtorId !== currentUserId)
      .reduce((sum, transfer) => sum + transfer.amount, 0);

    const nettedDebt = Math.max(0, userDebt - owedToUser);
    const nettedOwedToUser = nettedDebt === 0 ? Math.max(0, owedToUser - userDebt) : 0;

    return {
      userDebt: nettedDebt,
      owedToUser: nettedOwedToUser,
    };
  };

  const submitTransaction = async () => {
    if (!openedRoom || !authenticatedUser) {
      return;
    }

    const companyName = transactionCompanyName.trim();
    const normalizedItems = transactionItems
      .map((item) => ({
        itemName: item.itemName.trim(),
        itemCount: Number(item.itemCount),
        unitPrice: Number(item.unitPrice),
        allocations: Object.entries(item.allocations).map(([userId, quantity]) => ({
          userId,
          quantity: Number(quantity),
        })),
      }))
      .filter((item) => item.itemName.length > 0);

    if (!companyName || normalizedItems.length === 0) {
      setRoomDetailsError('Please provide company name and at least one transaction item.');
      return;
    }

    const hasInvalidItem = normalizedItems.some(
      (item) =>
        !Number.isFinite(item.itemCount) ||
        !Number.isFinite(item.unitPrice) ||
        item.allocations.some((allocation) => !Number.isFinite(allocation.quantity))
    );

    if (hasInvalidItem) {
      setRoomDetailsError('Each item must include valid count and unit price values.');
      return;
    }

    const hasInvalidRange = normalizedItems.some((item) => item.itemCount <= 0 || item.unitPrice < 0);
    if (hasInvalidRange) {
      setRoomDetailsError('Item count must be greater than 0 and unit price must be at least 0.');
      return;
    }

    const hasInvalidAssignedQuantity = normalizedItems.some((item) =>
      item.allocations.some((allocation) => allocation.quantity < 0)
    );
    if (hasInvalidAssignedQuantity) {
      setRoomDetailsError('Assigned quantity must be at least 0 for each user.');
      return;
    }

    const hasInvalidTotalAllocated = normalizedItems.some(
      (item) =>
        item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) > item.itemCount
    );
    if (hasInvalidTotalAllocated) {
      setRoomDetailsError('Assigned quantity across all users cannot exceed item count.');
      return;
    }

    try {
      setRoomActionLoading(true);
      setRoomDetailsError('');

      let savedTransactionId = '';
      let savedItems: Array<{ id: string }> = [];

      if (editingTransaction) {
        const response = await updateRoomTransaction(openedRoom.id, editingTransaction.id, {
          companyName,
          ownerUserId: authenticatedUser.id,
          items: normalizedItems.map((item) => ({
            itemName: item.itemName,
            itemCount: item.itemCount,
            unitPrice: item.unitPrice,
          })),
        });

        savedTransactionId = response.transaction.id;
        savedItems = response.transaction.items;
      } else {
        const response = await createRoomTransaction(openedRoom.id, {
          companyName,
          ownerUserId: authenticatedUser.id,
          items: normalizedItems.map((item) => ({
            itemName: item.itemName,
            itemCount: item.itemCount,
            unitPrice: item.unitPrice,
          })),
        });

        savedTransactionId = response.transaction.id;
        savedItems = response.transaction.items;
      }

      const allocationRequests = normalizedItems
        .flatMap((item, index) => {
          const savedItemId = savedItems[index]?.id;

          if (!savedItemId) {
            return [];
          }

          return item.allocations
            .filter((allocation) => allocation.quantity > 0)
            .map((allocation) => ({
              savedItemId,
              userId: Number(allocation.userId),
              quantity: allocation.quantity,
            }));
        })
        .filter((allocation) => Number.isFinite(allocation.userId));

      if (allocationRequests.length > 0 && savedTransactionId) {
        await Promise.all(
          allocationRequests.map((allocation) => {
            if (allocation.userId === authenticatedUser.id) {
              return takeRoomTransactionItem(openedRoom.id, savedTransactionId, allocation.savedItemId, {
                quantity: allocation.quantity,
              });
            }

            return assignRoomTransactionItem(openedRoom.id, savedTransactionId, allocation.savedItemId, {
              userId: allocation.userId,
              quantity: allocation.quantity,
            });
          })
        );
      }

      setAddTransactionModalVisible(false);
      resetTransactionForm();
      setRoomDetailsStatus(
        editingTransaction ? 'Transaction updated successfully.' : 'Transaction created successfully.'
      );
      await fetchRoomDetails(openedRoom);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : editingTransaction
              ? 'Unable to update transaction right now.'
              : 'Unable to create transaction right now.';
        setRoomDetailsError(message);
      } else {
        setRoomDetailsError(
          editingTransaction
            ? 'Unable to update transaction right now.'
            : 'Unable to create transaction right now.'
        );
      }
    } finally {
      setRoomActionLoading(false);
    }
  };

  const onDeleteTransaction = async () => {
    if (!openedRoom || !editingTransaction) {
      return;
    }

    try {
      setRoomActionLoading(true);
      setRoomDetailsError('');
      const response = await deleteRoomTransaction(openedRoom.id, editingTransaction.id);
      setAddTransactionModalVisible(false);
      resetTransactionForm();
      setRoomDetailsStatus(response.message || 'Transaction deleted successfully.');
      await fetchRoomDetails(openedRoom);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to delete transaction right now.';
        setRoomDetailsError(message);
      } else {
        setRoomDetailsError('Unable to delete transaction right now.');
      }
    } finally {
      setRoomActionLoading(false);
    }
  };

  const extractInviteCode = (rawValue: string): string => {
    const value = rawValue.trim();

    try {
      const parsedUrl = new URL(value);
      const inviteCodeFromQuery = parsedUrl.searchParams.get('inviteCode');

      if (inviteCodeFromQuery) {
        return inviteCodeFromQuery.trim();
      }
    } catch {
      return value;
    }

    return value;
  };

  const joinRoomFromInvite = async (rawInviteCode: string) => {
    const inviteCode = extractInviteCode(rawInviteCode);

    if (!inviteCode) {
      setRoomsError('Scanned code does not contain a valid invite code.');
      return;
    }

    try {
      setRoomActionLoading(true);
      setRoomsError('');
      const response = await joinRoom({ inviteCode });
      setRoomStatusMessage(response.message || `Joined ${response.room.name}.`);
      setJoinScannerVisible(false);
      setAddRoomModalVisible(false);
      setHasProcessedScan(false);
      await fetchRooms();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to join room with this invite code.';
        setRoomsError(message);
      } else {
        setRoomsError('Unable to join room with this invite code.');
      }
    } finally {
      setRoomActionLoading(false);
    }
  };
  const onScannedCode = async (result: BarcodeScanningResult) => {
    if (hasProcessedScan || roomActionLoading) {
      return;
    }

    setHasProcessedScan(true);
    await joinRoomFromInvite(result.data);
  };

  const onCreateRoom = async () => {
    const trimmedName = createRoomName.trim();

    if (trimmedName.length < 3 || trimmedName.length > 120) {
      setRoomsError('Room name must be between 3 and 120 characters.');
      return;
    }

    try {
      setRoomActionLoading(true);
      setRoomsError('');
      const response = await createRoom({ name: trimmedName });
      setCreateRoomModalVisible(false);
      setAddRoomModalVisible(false);
      setCreateRoomName('');
      setRoomStatusMessage(response.message || `Room ${response.room.name} created.`);
      await fetchRooms();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to create room right now.';
        setRoomsError(message);
      } else {
        setRoomsError('Unable to create room right now.');
      }
    } finally {
      setRoomActionLoading(false);
    }
  };

  const openJoinScanner = async () => {
    setAddRoomModalVisible(false);
    setHasProcessedScan(false);
    setRoomsError('');

    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        setRoomsError('Camera permission is required to scan room QR codes.');
        return;
      }
    }

    setJoinScannerVisible(true);
  };

  const onSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!normalizedEmail || !trimmedPassword) {
      setAuthError('Email and password are required.');
      setStatusMessage('');
      return;
    }

    try {
      setLoading(true);
      setAuthError('');

      if (mode === 'login') {
        const response = await login({ email: normalizedEmail, password: trimmedPassword });
        setAuthToken(response.token);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.token, response.token),
          AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(response.user)),
        ]);
        setAuthenticatedUser(response.user);
        setPassword('');
        setStatusMessage('');
        return;
      }

      const response = await register({ email: normalizedEmail, password: trimmedPassword });
      setStatusMessage(`Account created for ${response.user.email}. You can now sign in.`);
      setPassword('');
      setMode('login');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : mode === 'login'
              ? 'Invalid credentials. Please try again.'
              : 'Registration failed. Please try a different email.';

        setAuthError(message);
        setStatusMessage('');
      } else {
        setAuthError('Unexpected error, please try again.');
        setStatusMessage('');
      }
    } finally {
      setLoading(false);
    }
  };

  if (restoringSession) {
    return (
      <View style={styles.homeScreen}>
        <ActivityIndicator color="#B8C3FF" />
        <Text style={styles.restoreText}>Restoring session...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (authenticatedUser) {
    return (
      <SafeAreaView style={styles.homeScreen}>
        <TopNavBar user={authenticatedUser} />
        <View style={styles.roomsContentWrap}>
          {activeNav === 'settings' ? (
            <View style={styles.profileWrap}>
              <View style={styles.profileCard}>
                <Text style={styles.profileTitle}>Profile</Text>
                <Text style={styles.profileLabel}>Email</Text>
                <Text style={styles.profileValue}>{authenticatedUser.email}</Text>
                <Text style={styles.profileLabel}>User ID</Text>
                <Text style={styles.profileValue}>{String(authenticatedUser.id)}</Text>
                <Pressable
                  style={({ pressed }) => [styles.modalPrimaryButton, pressed && styles.modalOptionPressed]}
                  onPress={handleLogout}
                >
                  <Text style={styles.modalPrimaryText}>Log Out</Text>
                </Pressable>
              </View>
            </View>
          ) : openedRoom ? (
            <>
              <View style={styles.roomDetailsTopBar}>
                <Pressable
                  style={({ pressed }) => [styles.roomBackButton, pressed && styles.modalOptionPressed]}
                  onPress={() => {
                    setOpenedRoom(null);
                    setRoomDetailsError('');
                    setRoomDetailsStatus('');
                  }}
                >
                  <MaterialIcons name="arrow-back" size={18} color="#E5E2E3" />
                  <Text style={styles.roomBackText}>Rooms</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.roomsScroll}
                contentContainerStyle={styles.roomsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.roomsHeader}>
                  <Text style={styles.roomsHeaderKicker}>Room</Text>
                  <View style={styles.roomOpenHeaderRow}>
                    <Text style={styles.roomsHeaderTitleSmall}>{openedRoom.name}</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.settleButton,
                        pressed && styles.addRoomButtonPressed,
                        (settleLoadingRoomId === openedRoom.id || settleAllLoading || roomDetailsLoading) && styles.buttonDisabled,
                      ]}
                      onPress={() => {
                        void settleRoomDebt(openedRoom);
                      }}
                      disabled={Boolean(settleLoadingRoomId) || settleAllLoading || roomDetailsLoading}
                    >
                      {settleLoadingRoomId === openedRoom.id ? (
                        <ActivityIndicator color="#EFEFFF" size="small" />
                      ) : (
                        <Text style={styles.settleButtonText}>settle</Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.debtCard}>
                  {(() => {
                    const debt = computeRoomDebt();

                    return (
                      <>
                        <Text style={styles.debtTitle}>Your Netted Debt</Text>
                        <Text style={styles.debtValue}>${debt.userDebt.toFixed(2)}</Text>
                        <Text style={styles.debtMeta}>
                          Sum of your debts to all other room members.
                        </Text>
                        {debt.userDebt === 0 ? (
                          <Text style={styles.debtMeta}>
                            Others owe you: ${debt.owedToUser.toFixed(2)}
                          </Text>
                        ) : null}
                      </>
                    );
                  })()}
                </View>

                <View style={styles.roomActionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.roomActionButton, pressed && styles.addRoomButtonPressed]}
                    onPress={openCreateTransactionModal}
                  >
                    <MaterialIcons name="add-circle" size={20} color="#B8C3FF" />
                    <Text style={styles.roomActionText}>Add Transaction</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.roomActionButton, pressed && styles.addRoomButtonPressed]}
                    onPress={() => {
                      void openLiveReceiptScanner();
                    }}
                    disabled={roomActionLoading}
                  >
                    <MaterialIcons name="document-scanner" size={20} color="#B8C3FF" />
                    <Text style={styles.roomActionText}>Live Receipt Scan</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.roomActionButton,
                      pressed && styles.addRoomButtonPressed,
                      { flexBasis: '100%', flexDirection: 'row', paddingVertical: 14, gap: 8 },
                    ]}
                    onPress={openVoiceTransactionModal}
                    disabled={roomActionLoading}
                  >
                    <MaterialIcons name="keyboard-voice" size={20} color="#B8C3FF" />
                    <Text style={styles.roomActionText}>Add by Voice</Text>
                  </Pressable>
                </View>

                {roomDetailsLoading ? (
                  <View style={styles.roomsLoadingWrap}>
                    <ActivityIndicator color="#B8C3FF" />
                  </View>
                ) : (
                  <>
                    <View style={styles.sectionCard}>
                      <Pressable
                        style={({ pressed }) => [styles.sectionHeaderButton, pressed && styles.modalOptionPressed]}
                        onPress={() => setMembersExpanded((previous) => !previous)}
                      >
                        <Text style={styles.sectionTitle}>Members</Text>
                        <MaterialIcons
                          name={membersExpanded ? 'expand-less' : 'expand-more'}
                          size={20}
                          color="#A6B4FF"
                        />
                      </Pressable>
                      {membersExpanded ? (
                        <View>
                          {roomMembers.length > 0 ? (
                            roomMembers.map((entry) => (
                              <View key={entry.user.id} style={styles.memberRow}>
                                <Text style={styles.memberEmail}>{entry.user.email}</Text>
                                <Text style={styles.memberRole}>{entry.membership.role}</Text>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.emptyStateText}>No members found.</Text>
                          )}
                          <Pressable
                            style={({ pressed }) => [
                              styles.roomActionButton,
                              pressed && styles.addRoomButtonPressed,
                              { marginTop: 12, flexDirection: 'row', paddingVertical: 14, gap: 8 },
                            ]}
                            onPress={() => setInviteModalVisible(true)}
                          >
                            <MaterialIcons name="qr-code" size={20} color="#B8C3FF" />
                            <Text style={styles.roomActionText}>Invite by QR</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Transactions</Text>
                      {roomTransactions.length > 0 ? (
                        roomTransactions.map((transaction) => (
                          <Pressable
                            key={transaction.id}
                            style={({ pressed }) => [styles.transactionCard, pressed && styles.roomCardPressed]}
                            onPress={() => openEditTransactionModal(transaction)}
                          >
                            <View style={styles.transactionHead}>
                              <Text style={styles.transactionCompany}>{transaction.companyName}</Text>
                              <Text style={styles.transactionTotal}>
                                ${transaction.totalAmount.toFixed(2)}
                              </Text>
                            </View>
                            <Text style={styles.transactionMeta}>
                              {transaction.items.length} item(s) • {transaction.owner.email}
                            </Text>
                          </Pressable>
                        ))
                      ) : (
                        <Text style={styles.emptyStateText}>No transactions found.</Text>
                      )}
                    </View>
                  </>
                )}

                {roomDetailsError ? <Text style={styles.roomsErrorText}>{roomDetailsError}</Text> : null}
                {roomDetailsStatus ? <Text style={styles.roomsSuccessText}>{roomDetailsStatus}</Text> : null}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.roomsHeader}>
                <Text style={styles.roomsHeaderKicker}>Management</Text>
                <View style={styles.roomsHeaderTitleRow}>
                  <Text style={styles.roomsHeaderTitle}>Rooms</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.settleButton,
                      pressed && styles.addRoomButtonPressed,
                      settleAllLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      void settleAllRoomsDebt();
                    }}
                    disabled={settleAllLoading || settleLoadingRoomId !== null || roomsLoading}
                  >
                    {settleAllLoading ? (
                      <ActivityIndicator color="#EFEFFF" size="small" />
                    ) : (
                      <Text style={styles.settleButtonText}>settle all</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <ScrollView
                style={styles.roomsScroll}
                contentContainerStyle={styles.roomsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {roomsLoading ? (
                  <View style={styles.roomsLoadingWrap}>
                    <ActivityIndicator color="#B8C3FF" />
                  </View>
                ) : rooms.length > 0 ? (
                  rooms.map((room) => (
                    <Pressable
                      key={room.id}
                      style={({ pressed }) => [styles.roomCardOuter, pressed && styles.roomCardPressed]}
                      onPress={() => {
                        void openRoom(room);
                      }}
                    >
                      <View style={styles.roomCardInner}>
                        <View style={styles.roomCardLeftGroup}>
                          <View style={styles.roomIconWrap}>
                            <MaterialIcons name="apartment" size={28} color="#2E5BFF" />
                          </View>
                          <View>
                            <Text style={styles.roomTitle}>{room.name}</Text>
                            <Text style={styles.roomMeta}>Shared Space</Text>
                          </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#5D5F6B" />
                      </View>
                    </Pressable>
                  ))
                ) : null}

                <Pressable
                  style={({ pressed }) => [styles.addRoomButton, pressed && styles.addRoomButtonPressed]}
                  onPress={() => {
                    setRoomStatusMessage('');
                    setAddRoomModalVisible(true);
                  }}
                >
                  <MaterialIcons name="add-circle" size={24} color="#8E90A2" />
                  <Text style={styles.addRoomButtonText}>Add New Room</Text>
                </Pressable>

                {roomsError ? <Text style={styles.roomsErrorText}>{roomsError}</Text> : null}
                {roomStatusMessage ? <Text style={styles.roomsSuccessText}>{roomStatusMessage}</Text> : null}
              </ScrollView>
            </>
          )}
        </View>

        <Modal
          visible={isPaymentGateVisible}
          transparent
          animationType="fade"
          onRequestClose={() => resolveDummyPaymentGate(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Dummy Payment Gate</Text>
              <Text style={styles.paymentGateText}>{paymentGateContext}</Text>
              <Text style={styles.paymentGateAmount}>Pay ${paymentGateAmount.toFixed(2)}</Text>
              <Pressable
                style={({ pressed }) => [styles.modalPrimaryButton, pressed && styles.modalOptionPressed]}
                onPress={() => resolveDummyPaymentGate(true)}
              >
                <Text style={styles.modalPrimaryText}>Confirm Payment</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                onPress={() => resolveDummyPaymentGate(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isInviteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setInviteModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Invite to {openedRoom?.name}</Text>
              {openedRoom ? (
                <View style={styles.inviteQrWrap}>
                  <View style={styles.inviteQrImage}>
                    <QRCode
                      value={`shfi://join?inviteCode=${openedRoom.inviteCode}`}
                      size={200}
                      color="#0D0D0E"
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                </View>
              ) : null}
              <Text style={styles.inviteCodeText}>Invite code: {openedRoom?.inviteCode}</Text>
              <Pressable
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                onPress={() => setInviteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isAddTransactionModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setAddTransactionModalVisible(false);
            resetTransactionForm();
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, styles.modalCardScrollable]}>
              <ScrollView
                style={styles.modalFormScroll}
                contentContainerStyle={styles.modalFormScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalTitle}>
                  {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
                </Text>
                <TextInput
                  placeholder="Company name"
                  placeholderTextColor="#8E90A2"
                  style={styles.modalInput}
                  value={transactionCompanyName}
                  onChangeText={setTransactionCompanyName}
                  editable={!roomActionLoading}
                />

                <View style={styles.itemsSectionWrap}>
                  <Text style={styles.modalSectionLabel}>Items</Text>
                  {transactionItems.map((item, index) => (
                    <View key={index} style={styles.itemRowCard}>
                      <View style={styles.itemRowHeader}>
                        <Text style={styles.itemRowLabel}>Item {index + 1}</Text>
                        {transactionItems.length > 1 ? (
                          <Pressable
                            style={({ pressed }) => [styles.itemRemoveBtn, pressed && styles.modalOptionPressed]}
                            onPress={() => removeTransactionItemRow(index)}
                            disabled={roomActionLoading}
                          >
                            <MaterialIcons name="delete-outline" size={18} color="#FFB4AB" />
                          </Pressable>
                        ) : null}
                      </View>
                      <TextInput
                        placeholder="Item name"
                        placeholderTextColor="#8E90A2"
                        style={styles.modalInput}
                        value={item.itemName}
                        onChangeText={(value) => updateTransactionItem(index, 'itemName', value)}
                        editable={!roomActionLoading}
                      />
                      <View style={styles.txInputRow}>
                        <TextInput
                          placeholder="Count"
                          placeholderTextColor="#8E90A2"
                          style={[styles.modalInput, styles.txInputHalf]}
                          keyboardType="number-pad"
                          value={item.itemCount}
                          onChangeText={(value) => updateTransactionItem(index, 'itemCount', value)}
                          editable={!roomActionLoading}
                        />
                        <View style={[styles.modalInput, styles.txInputHalf, { flexDirection: 'row', alignItems: 'center' }]}>
                          <Text style={{ color: '#8E90A2', marginRight: 4 }}>$</Text>
                          <TextInput
                            placeholder="Unit price"
                            placeholderTextColor="#8E90A2"
                            style={{ flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 0 }}
                            keyboardType="decimal-pad"
                            value={item.unitPrice}
                            onChangeText={(value) => updateTransactionItem(index, 'unitPrice', value)}
                            editable={!roomActionLoading}
                          />
                        </View>
                      </View>
                      <Text style={styles.itemAssignLabel}>Assign quantities by user</Text>
                      <View style={styles.allocationsList}>
                        {roomMembers.map((member) => {
                          const memberId = String(member.user.id);
                          const isCurrentUser = memberId === String(authenticatedUser?.id);

                          return (
                            <View key={`${index}-${member.user.id}`} style={styles.allocationRow}>
                              <Text style={styles.allocationUserText} numberOfLines={1}>
                                {member.user.email}
                                {isCurrentUser ? ' (you)' : ''}
                              </Text>
                              <TextInput
                                placeholder="0"
                                placeholderTextColor="#8E90A2"
                                style={styles.allocationInput}
                                keyboardType="number-pad"
                                value={item.allocations[memberId] ?? '0'}
                                onChangeText={(value) => updateTransactionAllocation(index, memberId, value)}
                                editable={!roomActionLoading}
                              />
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <Pressable
                    style={({ pressed }) => [styles.addItemButton, pressed && styles.modalOptionPressed]}
                    onPress={addTransactionItemRow}
                    disabled={roomActionLoading}
                  >
                    <MaterialIcons name="add" size={16} color="#B8C3FF" />
                    <Text style={styles.addItemButtonText}>Add Item</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.modalPrimaryButton,
                    pressed && styles.modalOptionPressed,
                    roomActionLoading && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void submitTransaction();
                  }}
                  disabled={roomActionLoading}
                >
                  {roomActionLoading ? (
                    <ActivityIndicator color="#EFEFFF" />
                  ) : (
                    <Text style={styles.modalPrimaryText}>
                      {editingTransaction ? 'Save Changes' : 'Save Transaction'}
                    </Text>
                  )}
                </Pressable>
                {editingTransaction ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalDangerButton,
                      pressed && styles.modalOptionPressed,
                      roomActionLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      void onDeleteTransaction();
                    }}
                    disabled={roomActionLoading}
                  >
                    <Text style={styles.modalDangerText}>Delete Transaction</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                  onPress={() => {
                    setAddTransactionModalVisible(false);
                    resetTransactionForm();
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isAddRoomModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddRoomModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add New Room</Text>
              <Pressable
                style={({ pressed }) => [styles.modalOptionButton, pressed && styles.modalOptionPressed]}
                onPress={() => {
                  setAddRoomModalVisible(false);
                  setCreateRoomModalVisible(true);
                }}
              >
                <Text style={styles.modalOptionText}>Create New Room</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalOptionButton, pressed && styles.modalOptionPressed]}
                onPress={() => {
                  void openJoinScanner();
                }}
              >
                <Text style={styles.modalOptionText}>Join Existing Room (Scan QR)</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                onPress={() => setAddRoomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isCreateRoomModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCreateRoomModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Create New Room</Text>
              <TextInput
                placeholder="Room name"
                placeholderTextColor="#8E90A2"
                style={styles.modalInput}
                value={createRoomName}
                onChangeText={setCreateRoomName}
                editable={!roomActionLoading}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  pressed && styles.modalOptionPressed,
                  roomActionLoading && styles.buttonDisabled,
                ]}
                onPress={() => {
                  void onCreateRoom();
                }}
                disabled={roomActionLoading}
              >
                {roomActionLoading ? (
                  <ActivityIndicator color="#EFEFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Create</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                onPress={() => {
                  setCreateRoomModalVisible(false);
                  setCreateRoomName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isVoiceModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeVoiceTransactionModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Transaction by Voice</Text>
              <Text style={styles.voiceHintText}>
                Speak the company name, item names, quantities, and prices.
              </Text>
              {voiceTranscript ? (
                <Text style={styles.voiceTranscriptText} numberOfLines={4}>
                  Transcript: {voiceTranscript}
                </Text>
              ) : null}
              <Text style={styles.voiceStatusText}>{voiceStatus}</Text>
              {isVoiceProcessing ? (
                <View style={styles.liveScanProcessingRow}>
                  <ActivityIndicator color="#B8C3FF" />
                  <Text style={styles.liveScanProcessingText}>Processing voice…</Text>
                </View>
              ) : null}
              <View style={styles.voiceControlRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.liveScanControlButton,
                    pressed && styles.modalOptionPressed,
                    (isVoiceRecording || isVoiceProcessing) && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void startVoiceRecording();
                  }}
                  disabled={isVoiceRecording || isVoiceProcessing}
                >
                  <Text style={styles.liveScanControlText}>Start Recording</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.liveScanControlButton,
                    pressed && styles.modalOptionPressed,
                    (!isVoiceRecording || isVoiceProcessing) && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void stopVoiceRecordingAndParse();
                  }}
                  disabled={!isVoiceRecording || isVoiceProcessing}
                >
                  <Text style={styles.liveScanControlText}>Stop & Parse</Text>
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.modalCancelButton,
                  pressed && styles.modalOptionPressed,
                  (isVoiceRecording || isVoiceProcessing) && styles.buttonDisabled,
                ]}
                onPress={closeVoiceTransactionModal}
                disabled={isVoiceRecording || isVoiceProcessing}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isJoinScannerVisible}
          animationType="slide"
          onRequestClose={() => {
            setJoinScannerVisible(false);
            setHasProcessedScan(false);
          }}
        >
          <SafeAreaView style={styles.scannerScreen}>
            <View style={styles.scannerTopBar}>
              <Text style={styles.scannerTitle}>Scan Room QR</Text>
              <Pressable
                style={({ pressed }) => [styles.scannerCloseBtn, pressed && styles.modalOptionPressed]}
                onPress={() => {
                  setJoinScannerVisible(false);
                  setHasProcessedScan(false);
                }}
              >
                <Text style={styles.scannerCloseText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.scannerFrameWrap}>
              {cameraPermission?.granted ? (
                <CameraView
                  style={styles.scannerCamera}
                  facing="back"
                  onBarcodeScanned={onScannedCode}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                />
              ) : (
                <View style={styles.scannerPermissionFallback}>
                  <Text style={styles.scannerHint}>Camera permission is required to scan QR codes.</Text>
                </View>
              )}
            </View>
            <Text style={styles.scannerHint}>Point the camera at a room invite QR code.</Text>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={isLiveReceiptScannerVisible}
          animationType="slide"
          onRequestClose={closeLiveReceiptScanner}
        >
          <SafeAreaView style={styles.scannerScreen}>
            <View style={styles.scannerTopBar}>
              <Text style={styles.scannerTitle}>Live Receipt Scan</Text>
              <Pressable
                style={({ pressed }) => [styles.scannerCloseBtn, pressed && styles.modalOptionPressed]}
                onPress={closeLiveReceiptScanner}
              >
                <Text style={styles.scannerCloseText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.scannerFrameWrap}>
              {cameraPermission?.granted ?
                (
                  <CameraView ref={liveReceiptCameraRef} style={styles.scannerCamera} facing="back" />
                ) : (
                  <View style={styles.scannerPermissionFallback}>
                    <Text style={styles.scannerHint}>
                      Camera permission is required to scan receipts.
                    </Text>
                  </View>
                )}
            </View>
            <Text style={styles.scannerHint}>Keep receipt fully visible and steady in frame.</Text>
            <Text style={styles.scannerHint}>{liveReceiptStatus}</Text>
            {isLiveReceiptProcessing ? (
              <View style={styles.liveScanProcessingRow}>
                <ActivityIndicator color="#B8C3FF" />
                <Text style={styles.liveScanProcessingText}>Processing receipt…</Text>
              </View>
            ) : null}
            <View style={styles.liveScanControlRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.liveScanControlButton,
                  pressed && styles.modalOptionPressed,
                  (isLiveReceiptScanning || isLiveReceiptProcessing) && styles.buttonDisabled,
                ]}
                onPress={() => {
                  setLiveReceiptStatus('Live scan started…');
                  setLiveReceiptScanning(true);
                }}
                disabled={isLiveReceiptScanning || isLiveReceiptProcessing || !cameraPermission?.granted}
              >
                <Text style={styles.liveScanControlText}>Start</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.liveScanControlButton,
                  pressed && styles.modalOptionPressed,
                  (!isLiveReceiptScanning || isLiveReceiptProcessing) && styles.buttonDisabled,
                ]}
                onPress={() => {
                  setLiveReceiptScanning(false);
                  setLiveReceiptStatus('Live scan stopped.');
                }}
                disabled={!isLiveReceiptScanning || isLiveReceiptProcessing}
              >
                <Text style={styles.liveScanControlText}>Stop</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Modal>

        <BottomNavBar activeKey={activeNav} onSelect={onNavSelect} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.backgroundPulseTop} />
      <View style={styles.backgroundPulseBottom} />

      <View style={styles.container}>
        <View style={styles.logoSection}>
          <View style={styles.logoWrapper}>
            <View style={styles.logoCircle}>
              <Image
                source={require('./assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.title}>SHFI</Text>
        </View>

        <View style={styles.formSection}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#8E90A2"
            style={styles.input}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (authError) {
                setAuthError('');
              }
            }}
            editable={!loading}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#8E90A2"
            style={styles.input}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (authError) {
                setAuthError('');
              }
            }}
            editable={!loading}
          />

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          {statusMessage ? <Text style={styles.successText}>{statusMessage}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#EFEFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setAuthError('');
              setStatusMessage('');
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>{secondaryButtonLabel}</Text>
          </Pressable>
        </View>
      </View>

      <StatusBar style="light" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131314',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backgroundPulseTop: {
    position: 'absolute',
    top: -120,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(46, 91, 255, 0.12)',
  },
  backgroundPulseBottom: {
    position: 'absolute',
    bottom: -100,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(46, 91, 255, 0.1)',
  },
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  logoSection: {
    marginBottom: 56,
    alignItems: 'center',
    gap: 12,
  },
  logoWrapper: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#1C1B1C',
    borderWidth: 1,
    borderColor: '#353436',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 62,
    height: 62,
  },
  title: {
    color: '#E5E2E3',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  formSection: {
    width: '100%',
    gap: 12,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#434656',
    backgroundColor: '#1C1B1C',
    color: '#E5E2E3',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primaryButton: {
    height: 56,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#2E5BFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2E5BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: '#EFEFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#353436',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.92,
  },
  secondaryButtonText: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#FFB4AB',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  successText: {
    color: '#A6B4FF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  homeScreen: {
    flex: 1,
    backgroundColor: '#131314',
    paddingTop: (Platform.OS === 'android' || Platform.OS === 'ios') ? RNStatusBar.currentHeight : 0,
  },
  homeContentWrap: {
    display: 'none',
  },
  roomsContentWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 104,
  },
  roomsHeader: {
    marginBottom: 18,
  },
  roomsHeaderKicker: {
    color: '#2E5BFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  roomsHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  roomsHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  roomsScroll: {
    flex: 1,
  },
  roomsScrollContent: {
    gap: 12,
    paddingBottom: 22,
  },
  roomsLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  roomCardOuter: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#1C1B1C',
    borderWidth: 1,
    borderColor: '#353436',
    padding: 1,
  },
  roomCardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  roomCardInner: {
    borderRadius: 13,
    backgroundColor: '#131314',
    paddingHorizontal: 18,
    paddingVertical: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomCardLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  roomIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#353436',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  settleButton: {
    borderRadius: 10,
    backgroundColor: '#2E5BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 66,
  },
  settleButtonText: {
    color: '#EFEFFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  paymentGateText: {
    color: '#C4C5D9',
    fontSize: 13,
    fontWeight: '500',
  },
  paymentGateAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  roomMeta: {
    marginTop: 3,
    color: '#778',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  addRoomButton: {
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  addRoomButtonPressed: {
    opacity: 0.85,
  },
  addRoomButtonText: {
    color: '#B3B5C5',
    fontSize: 15,
    fontWeight: '700',
  },
  roomsErrorText: {
    color: '#FFB4AB',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  roomsSuccessText: {
    color: '#A6B4FF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  profileWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  profileCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#353436',
    backgroundColor: '#1C1B1C',
    padding: 16,
    gap: 8,
  },
  profileTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.8,
  },
  profileLabel: {
    color: '#8E90A2',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileValue: {
    color: '#E5E2E3',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  roomDetailsTopBar: {
    marginBottom: 8,
  },
  roomBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  roomBackText: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '600',
  },
  roomOpenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roomsHeaderTitleSmall: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  debtCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#33438C',
    backgroundColor: '#1C1B1C',
    padding: 14,
    gap: 4,
    marginBottom: 12,
  },
  debtTitle: {
    color: '#A6B4FF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  debtValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  debtMeta: {
    color: '#C4C5D9',
    fontSize: 12,
    fontWeight: '500',
  },
  roomActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  roomActionButton: {
    flexGrow: 1,
    flexBasis: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#353436',
    backgroundColor: '#1C1B1C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  roomActionText: {
    color: '#D4D5E2',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#353436',
    backgroundColor: '#1C1B1C',
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  sectionHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131314',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2B',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  memberEmail: {
    color: '#E5E2E3',
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  memberRole: {
    color: '#A6B4FF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: 10,
  },
  transactionCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2B',
    backgroundColor: '#131314',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  transactionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  transactionCompany: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  transactionTotal: {
    color: '#B8C3FF',
    fontSize: 13,
    fontWeight: '700',
  },
  transactionMeta: {
    color: '#9FA2B5',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyStateText: {
    color: '#9FA2B5',
    fontSize: 13,
    fontWeight: '500',
  },
  inviteQrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  inviteQrImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCodeText: {
    color: '#C4C5D9',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  txInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  txInputHalf: {
    flex: 1,
  },
  restoreText: {
    color: '#C4C5D9',
    fontSize: 14,
    marginTop: 10,
  },
  topNavShell: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(13, 13, 14, 0.8)',
    zIndex: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  topNavLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  topNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topNavRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  topNavProfileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  topNavLogoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  bottomNavShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(10, 10, 10, 0.9)',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    minWidth: 64,
  },
  navItemAddContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minWidth: 64,
  },
  navItemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.9 }],
  },
  navLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  navLabelInactive: {
    color: '#737373',
  },
  navLabelActive: {
    color: '#E5E2E3',
  },
  navLabelAdd: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#3B82F6',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#353436',
    backgroundColor: '#1C1B1C',
    padding: 16,
    gap: 10,
  },
  modalCardScrollable: {
    maxHeight: '88%',
  },
  modalFormScroll: {
    flexGrow: 0,
  },
  modalFormScrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalOptionButton: {
    borderRadius: 10,
    backgroundColor: '#2A2A2B',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  modalOptionText: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOptionPressed: {
    opacity: 0.85,
  },
  modalCancelButton: {
    borderRadius: 10,
    backgroundColor: '#353436',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '600',
  },
  modalInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#434656',
    backgroundColor: '#131314',
    color: '#E5E2E3',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  modalSectionLabel: {
    color: '#C4C5D9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  itemsSectionWrap: {
    gap: 8,
  },
  itemRowCard: {
    borderWidth: 1,
    borderColor: '#353436',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: '#131314',
  },
  itemRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemRowLabel: {
    color: '#A6B4FF',
    fontSize: 12,
    fontWeight: '600',
  },
  itemAssignLabel: {
    color: '#9FA2B5',
    fontSize: 12,
    fontWeight: '600',
  },
  allocationsList: {
    gap: 8,
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allocationUserText: {
    flex: 1,
    color: '#C4C5D9',
    fontSize: 12,
    fontWeight: '500',
  },
  allocationInput: {
    width: 88,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#434656',
    backgroundColor: '#131314',
    color: '#E5E2E3',
    paddingHorizontal: 12,
    fontSize: 14,
  },
  itemRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2B',
  },
  addItemButton: {
    borderWidth: 1,
    borderColor: '#434656',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  addItemButtonText: {
    color: '#B8C3FF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalPrimaryButton: {
    borderRadius: 10,
    backgroundColor: '#2E5BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  modalPrimaryText: {
    color: '#EFEFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalDangerButton: {
    borderRadius: 10,
    backgroundColor: '#93000A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalDangerText: {
    color: '#FFDAD6',
    fontSize: 14,
    fontWeight: '700',
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: '#0D0D0E',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
  },
  scannerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  scannerCloseBtn: {
    borderRadius: 8,
    backgroundColor: '#2A2A2B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scannerCloseText: {
    color: '#E5E2E3',
    fontSize: 13,
    fontWeight: '600',
  },
  scannerFrameWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#353436',
    backgroundColor: '#1C1B1C',
  },
  scannerCamera: {
    flex: 1,
  },
  scannerPermissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scannerHint: {
    color: '#C4C5D9',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
  },
  liveScanControlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  voiceControlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  voiceHintText: {
    color: '#C4C5D9',
    fontSize: 13,
  },
  voiceStatusText: {
    color: '#B8C3FF',
    fontSize: 13,
    fontWeight: '600',
  },
  voiceTranscriptText: {
    color: '#E5E2E3',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#353436',
    borderRadius: 10,
    backgroundColor: '#131314',
    padding: 10,
  },
  liveScanProcessingRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  liveScanProcessingText: {
    color: '#B8C3FF',
    fontSize: 13,
    fontWeight: '600',
  },
  liveScanControlButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#2E5BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  liveScanControlText: {
    color: '#EFEFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
