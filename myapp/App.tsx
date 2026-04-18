import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import axios from 'axios';
import {
  createRoom,
  createRoomTransaction,
  joinRoom,
  listRoomMembers,
  listRooms,
  listRoomTransactions,
  login,
  register,
  Room,
  RoomMemberEntry,
  RoomTransaction,
  setAuthToken,
  User,
} from './src/api';

type AuthMode = 'login' | 'register';

const STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
};

type NavItem = {
  key: 'home' | 'assets' | 'market' | 'profile';
  label: 'Home' | 'Assets' | 'Market' | 'Profile';
  icon: 'grid-view' | 'account-balance-wallet' | 'monitor' | 'person';
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'grid-view' },
  { key: 'assets', label: 'Assets', icon: 'account-balance-wallet' },
  { key: 'market', label: 'Market', icon: 'monitor' },
  { key: 'profile', label: 'Profile', icon: 'person' },
];

function BottomNavBar({
  activeKey,
  onSelect,
}: {
  activeKey: NavItem['key'];
  onSelect: (key: NavItem['key']) => void;
}) {
  return (
    <View style={styles.bottomNavShell}>
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <Pressable
            key={item.key}
            style={({ pressed }) => [
              styles.navItem,
              isActive && styles.navItemActive,
              pressed && styles.navItemPressed,
            ]}
            onPress={() => onSelect(item.key)}
          >
            <MaterialIcons
              name={item.icon}
              size={22}
              color={isActive ? '#2E5BFF' : '#8E90A2'}
            />
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
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
  const [isInviteModalVisible, setInviteModalVisible] = useState(false);
  const [isAddTransactionModalVisible, setAddTransactionModalVisible] = useState(false);
  const [transactionCompanyName, setTransactionCompanyName] = useState('');
  const [transactionItemName, setTransactionItemName] = useState('');
  const [transactionItemCount, setTransactionItemCount] = useState('1');
  const [transactionUnitPrice, setTransactionUnitPrice] = useState('0');
  const [activeNav, setActiveNav] = useState<NavItem['key']>('home');

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
      setRoomTransactions(transactionsResponse.transactions ?? []);
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

  const onNavSelect = (key: NavItem['key']) => {
    if (key === 'home') {
      setActiveNav('home');
      setOpenedRoom(null);
      setRoomDetailsError('');
      setRoomDetailsStatus('');
      return;
    }

    if (key === 'profile') {
      setActiveNav('profile');
      setOpenedRoom(null);
      return;
    }

    setActiveNav(key);
  };

  const submitTransaction = async () => {
    if (!openedRoom || !authenticatedUser) {
      return;
    }

    const companyName = transactionCompanyName.trim();
    const itemName = transactionItemName.trim();
    const itemCount = Number(transactionItemCount);
    const unitPrice = Number(transactionUnitPrice);

    if (!companyName || !itemName || !Number.isFinite(itemCount) || !Number.isFinite(unitPrice)) {
      setRoomDetailsError('Please fill all transaction fields with valid values.');
      return;
    }

    if (itemCount <= 0 || unitPrice < 0) {
      setRoomDetailsError('Item count must be greater than 0 and unit price must be at least 0.');
      return;
    }

    try {
      setRoomActionLoading(true);
      setRoomDetailsError('');
      await createRoomTransaction(openedRoom.id, {
        companyName,
        ownerUserId: authenticatedUser.id,
        items: [
          {
            itemName,
            itemCount,
            unitPrice,
          },
        ],
      });
      setAddTransactionModalVisible(false);
      setTransactionCompanyName('');
      setTransactionItemName('');
      setTransactionItemCount('1');
      setTransactionUnitPrice('0');
      setRoomDetailsStatus('Transaction created successfully.');
      await fetchRoomDetails(openedRoom);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Unable to create transaction right now.';
        setRoomDetailsError(message);
      } else {
        setRoomDetailsError('Unable to create transaction right now.');
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
        <View style={styles.roomsContentWrap}>
          {activeNav === 'profile' ? (
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
                  <Text style={styles.roomsHeaderTitleSmall}>{openedRoom.name}</Text>
                </View>

                <View style={styles.roomActionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.roomActionButton, pressed && styles.addRoomButtonPressed]}
                    onPress={() => setInviteModalVisible(true)}
                  >
                    <MaterialIcons name="qr-code" size={20} color="#B8C3FF" />
                    <Text style={styles.roomActionText}>Invite by QR</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.roomActionButton, pressed && styles.addRoomButtonPressed]}
                    onPress={() => setAddTransactionModalVisible(true)}
                  >
                    <MaterialIcons name="add-circle" size={20} color="#B8C3FF" />
                    <Text style={styles.roomActionText}>Add Transaction</Text>
                  </Pressable>
                </View>

                {roomDetailsLoading ? (
                  <View style={styles.roomsLoadingWrap}>
                    <ActivityIndicator color="#B8C3FF" />
                  </View>
                ) : (
                  <>
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Members</Text>
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
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Transactions</Text>
                      {roomTransactions.length > 0 ? (
                        roomTransactions.map((transaction) => (
                          <View key={transaction.id} style={styles.transactionCard}>
                            <View style={styles.transactionHead}>
                              <Text style={styles.transactionCompany}>{transaction.companyName}</Text>
                              <Text style={styles.transactionTotal}>
                                ${transaction.totalAmount.toFixed(2)}
                              </Text>
                            </View>
                            <Text style={styles.transactionMeta}>
                              {transaction.items.length} item(s) • {transaction.owner.email}
                            </Text>
                          </View>
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
                <Text style={styles.roomsHeaderTitle}>Rooms</Text>
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
          onRequestClose={() => setAddTransactionModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Transaction</Text>
              <TextInput
                placeholder="Company name"
                placeholderTextColor="#8E90A2"
                style={styles.modalInput}
                value={transactionCompanyName}
                onChangeText={setTransactionCompanyName}
                editable={!roomActionLoading}
              />
              <TextInput
                placeholder="Item name"
                placeholderTextColor="#8E90A2"
                style={styles.modalInput}
                value={transactionItemName}
                onChangeText={setTransactionItemName}
                editable={!roomActionLoading}
              />
              <View style={styles.txInputRow}>
                <TextInput
                  placeholder="Count"
                  placeholderTextColor="#8E90A2"
                  style={[styles.modalInput, styles.txInputHalf]}
                  keyboardType="number-pad"
                  value={transactionItemCount}
                  onChangeText={setTransactionItemCount}
                  editable={!roomActionLoading}
                />
                <TextInput
                  placeholder="Unit price"
                  placeholderTextColor="#8E90A2"
                  style={[styles.modalInput, styles.txInputHalf]}
                  keyboardType="decimal-pad"
                  value={transactionUnitPrice}
                  onChangeText={setTransactionUnitPrice}
                  editable={!roomActionLoading}
                />
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
                  <Text style={styles.modalPrimaryText}>Save Transaction</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.modalOptionPressed]}
                onPress={() => setAddTransactionModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
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
  roomsHeaderTitleSmall: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  roomActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  roomActionButton: {
    flex: 1,
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
  },
  inviteCodeText: {
    color: '#C4C5D9',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  txInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  txInputHalf: {
    flex: 1,
  },
  restoreText: {
    color: '#C4C5D9',
    fontSize: 14,
    marginTop: 10,
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
    paddingTop: 10,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(13, 13, 14, 0.94)',
  },
  navItem: {
    minWidth: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  navItemActive: {
    backgroundColor: 'rgba(46, 91, 255, 0.12)',
  },
  navItemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  navLabel: {
    marginTop: 3,
    color: '#8E90A2',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  navLabelActive: {
    color: '#2E5BFF',
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
});
