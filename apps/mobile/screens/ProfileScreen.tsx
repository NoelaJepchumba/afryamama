import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getAuth, signOut } from 'firebase/auth';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseDb as db } from '../lib/firebaseClient';

// ── TYPES ─────────────────────────────────────
type Stage = 'PRENATAL' | 'POSTNATAL';

type ChildProfile = {
  childCode:  string;
  fullName:   string;
  sex:        string;
  birthDate:  string;
};

type MotherProfile = {
  fullName:              string;
  email:                 string;
  phone:                 string;
  motherCode:            string;
  stage:                 Stage;
  pregnancyWeek:         string;
  babyAgeMonths:         string;
  county:                string;
  facility:              string;
  emergencyContactName:  string;
  emergencyContactPhone: string;
  children?:             ChildProfile[];
  createdAt?:            any;
};

// ── REUSABLE COMPONENTS ───────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'Not set'}</Text>
    </View>
  );
}

function FieldInput({
  label, value, onChange, keyboardType, locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: any;
  locked?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}{locked ? ' (locked)' : ''}</Text>
      <TextInput
        style={[styles.input, locked && styles.inputLocked]}
        value={value}
        onChangeText={onChange}
        editable={!locked}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

// ── SCREEN ────────────────────────────────────
interface Props {
  email:   string;
  onBack?: () => void;
}

export default function ProfileScreen({ email, onBack }: Props) {
  const auth     = getAuth();
  const motherId = auth.currentUser?.uid ?? '';

  const [profile,  setProfile]  = useState<MotherProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // editable fields
  const [fullName,              setFullName]              = useState('');
  const [phone,                 setPhone]                 = useState('');
  const [stage,                 setStage]                 = useState<Stage>('PRENATAL');
  const [pregnancyWeek,         setPregnancyWeek]         = useState('');
  const [babyAgeMonths,         setBabyAgeMonths]         = useState('');
  const [county,                setCounty]                = useState('');
  const [facility,              setFacility]              = useState('');
  const [emergencyContactName,  setEmergencyContactName]  = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // ── READ ──────────────────────────────────
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'mothers', motherId));
        if (snap.exists()) {
          const data = snap.data() as MotherProfile;
          setProfile(data);
          syncToState(data);
        }
      } catch (e) {
        setError('Could not load profile from database.');
      } finally {
        setLoading(false);
      }
    };
    if (motherId) fetchProfile();
  }, [motherId]);

  function syncToState(data: MotherProfile) {
    setFullName(data.fullName                       ?? '');
    setPhone(data.phone                             ?? '');
    setStage(data.stage                             ?? 'PRENATAL');
    setPregnancyWeek(data.pregnancyWeek             ?? '');
    setBabyAgeMonths(data.babyAgeMonths             ?? '');
    setCounty(data.county                           ?? '');
    setFacility(data.facility                       ?? '');
    setEmergencyContactName(data.emergencyContactName   ?? '');
    setEmergencyContactPhone(data.emergencyContactPhone ?? '');
  }

  // ── UPDATE ────────────────────────────────
  const saveProfile = async () => {
    if (!fullName.trim() || !phone.trim() || !county.trim() || !facility.trim()) {
      setError('Full name, phone, county and facility are required.');
      return;
    }
    if (stage === 'PRENATAL' && !pregnancyWeek.trim()) {
      setError('Please enter your pregnancy week.');
      return;
    }
    if (stage === 'POSTNATAL' && !babyAgeMonths.trim()) {
      setError('Please enter your baby age in months.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated: Partial<MotherProfile> = {
        fullName:              fullName.trim(),
        phone:                 phone.trim(),
        stage,
        pregnancyWeek:         pregnancyWeek.trim(),
        babyAgeMonths:         babyAgeMonths.trim(),
        county:                county.trim(),
        facility:              facility.trim(),
        emergencyContactName:  emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
      };
      await updateDoc(doc(db, 'mothers', motherId), {
        ...updated,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } catch (e) {
      setError('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE ────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your profile and all linked child records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]
    );
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, 'mothers', motherId));
      await auth.currentUser?.delete();
    } catch (e) {
      Alert.alert('Error', 'Could not delete account. Please sign in again and retry.');
    }
  };

  const handleSignOut = () => signOut(auth);

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── LOADING ───────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#55075c" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* AVATAR CARD */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials(profile?.fullName ?? '')}</Text>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={styles.avatarName}>{profile?.fullName || 'Mother Profile'}</Text>
            <Text style={styles.avatarEmail}>{profile?.email || email || '—'}</Text>
            <Text style={styles.avatarJoined}>Joined: {formatDate(profile?.createdAt)}</Text>
          </View>
          <View style={[
            styles.stagePill,
            profile?.stage === 'PRENATAL' ? styles.stagePrenatal : styles.stagePostnatal,
          ]}>
            <Text style={styles.stagePillText}>
              {profile?.stage === 'PRENATAL' ? 'Prenatal' : 'Postnatal'}
            </Text>
          </View>
        </View>

        {/* NO PROFILE STATE */}
        {!profile && (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No profile found for this account.</Text>
          </View>
        )}

        {/* ── VIEW MODE ── */}
        {profile && !editing && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Personal Information</Text>
                <TouchableOpacity onPress={() => { setEditing(true); setError(null); }}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              </View>
              <InfoRow label="Mother Code"  value={profile.motherCode  ?? ''} />
              <InfoRow label="Full Name"    value={profile.fullName    ?? ''} />
              <InfoRow label="Email"        value={profile.email       ?? email} />
              <InfoRow label="Phone"        value={profile.phone       ?? ''} />
              <InfoRow label="County"       value={profile.county      ?? ''} />
              <InfoRow label="Facility"     value={profile.facility    ?? ''} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Care Stage</Text>
              <InfoRow label="Stage" value={profile.stage ?? ''} />
              {profile.stage === 'PRENATAL'
                ? <InfoRow label="Pregnancy Week"    value={profile.pregnancyWeek  ?? ''} />
                : <InfoRow label="Baby Age (Months)" value={profile.babyAgeMonths  ?? ''} />
              }
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Emergency Contact</Text>
              <InfoRow label="Name"  value={profile.emergencyContactName  ?? ''} />
              <InfoRow label="Phone" value={profile.emergencyContactPhone ?? ''} />
            </View>

            {profile.children?.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Children Profiles</Text>
                {profile.children.map((child, i) => (
                  <View key={child.childCode || i} style={styles.childCard}>
                    <View style={styles.childTop}>
                      <Text style={styles.childCode}>{child.childCode || 'No code'}</Text>
                      <Text style={styles.childSex}>{child.sex || '—'}</Text>
                    </View>
                    <Text style={styles.childName}>{child.fullName || 'Unnamed child'}</Text>
                    <Text style={styles.childDob}>DOB: {child.birthDate || 'Not set'}</Text>
                    <Text style={styles.childLocked}>Child code is auto-assigned and cannot be edited.</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}

        {/* ── EDIT MODE ── */}
        {profile && editing && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => {
                setEditing(false);
                setError(null);
                syncToState(profile);
              }}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <FieldInput label="Mother Code" value={profile.motherCode ?? ''} onChange={() => {}} locked />
            <FieldInput label="Full Name"   value={fullName}  onChange={setFullName} />
            <FieldInput label="Email"       value={profile.email ?? email} onChange={() => {}} locked />
            <FieldInput label="Phone"       value={phone}     onChange={setPhone}   keyboardType="phone-pad" />
            <FieldInput label="County"      value={county}    onChange={setCounty} />
            <FieldInput label="Facility"    value={facility}  onChange={setFacility} />

            <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Care Stage</Text>
            <View style={styles.stageRow}>
              {(['PRENATAL', 'POSTNATAL'] as Stage[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stageChip, stage === s && styles.stageChipActive]}
                  onPress={() => setStage(s)}
                >
                  <Text style={[styles.stageChipText, stage === s && styles.stageChipTextActive]}>
                    {s === 'PRENATAL' ? 'Prenatal' : 'Postnatal'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {stage === 'PRENATAL'
              ? <FieldInput label="Pregnancy Week"    value={pregnancyWeek}  onChange={setPregnancyWeek}  keyboardType="number-pad" />
              : <FieldInput label="Baby Age (Months)" value={babyAgeMonths}  onChange={setBabyAgeMonths}  keyboardType="number-pad" />
            }

            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Emergency Contact</Text>
            <FieldInput label="Contact Name"  value={emergencyContactName}  onChange={setEmergencyContactName} />
            <FieldInput label="Contact Phone" value={emergencyContactPhone} onChange={setEmergencyContactPhone} keyboardType="phone-pad" />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={saveProfile}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* SIGN OUT */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* DELETE */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete Account</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ── STYLES ───────────────────────────────────
const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#F8FAFC' },
  centered:             { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  loadingText:          { marginTop: 12, fontSize: 14, color: '#6B7280' },

  header:               { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 52, backgroundColor: '#55075c', gap: 14 },
  backBtn:              {},
  backBtnText:          { color: '#f5b8e8', fontSize: 16, fontWeight: '600' },
  headerTitle:          { fontSize: 20, fontWeight: '700', color: '#fff' },

  content:              { padding: 20, paddingBottom: 50 },

  avatarCard:           { backgroundColor: '#fff', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1, borderColor: '#EBD6ED' },
  avatarCircle:         { width: 56, height: 56, borderRadius: 28, backgroundColor: '#55075c', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText:           { fontSize: 22, fontWeight: '800', color: '#fff' },
  avatarInfo:           { flex: 1 },
  avatarName:           { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  avatarEmail:          { fontSize: 12, color: '#6B7280', marginTop: 2 },
  avatarJoined:         { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  stagePill:            { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  stagePrenatal:        { backgroundColor: '#f5eef7' },
  stagePostnatal:       { backgroundColor: '#fdf0f6' },
  stagePillText:        { fontSize: 11, fontWeight: '700', color: '#55075c' },

  card:                 { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#EBD6ED' },
  cardHeader:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EBD6ED' },
  cardTitle:            { fontSize: 12, fontWeight: '700', color: '#55075c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  editLink:             { fontSize: 13, fontWeight: '600', color: '#c9227a' },
  cancelLink:           { fontSize: 13, fontWeight: '600', color: '#6B7280' },

  infoRow:              { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoLabel:            { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue:            { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },

  childCard:            { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#EBD6ED' },
  childTop:             { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  childCode:            { fontSize: 11, fontWeight: '700', color: '#c9227a' },
  childSex:             { fontSize: 11, color: '#6B7280' },
  childName:            { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  childDob:             { fontSize: 12, color: '#6B7280' },
  childLocked:          { fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' },

  emptyText:            { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },

  fieldWrap:            { marginBottom: 14 },
  fieldLabel:           { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 5 },
  input:                { borderWidth: 1, borderColor: '#EBD6ED', borderRadius: 10, padding: 11, fontSize: 14, color: '#1a1a2e', backgroundColor: '#fdfafb' },
  inputLocked:          { backgroundColor: '#F3F4F6', color: '#9CA3AF' },

  stageRow:             { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stageChip:            { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#EBD6ED', alignItems: 'center', backgroundColor: '#fdfafb' },
  stageChipActive:      { backgroundColor: '#55075c', borderColor: '#55075c' },
  stageChipText:        { fontSize: 13, fontWeight: '600', color: '#374151' },
  stageChipTextActive:  { color: '#fff' },

  errorText:            { color: '#b91c1c', fontSize: 13, marginTop: 10, marginBottom: 4 },
  saveBtn:              { backgroundColor: '#55075c', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText:          { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled:          { opacity: 0.6 },

  signOutBtn:           { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#EBD6ED' },
  signOutText:          { fontSize: 15, fontWeight: '600', color: '#55075c' },

  deleteBtn:            { borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  deleteBtnText:        { fontSize: 15, fontWeight: '600', color: '#b91c1c' },
});
