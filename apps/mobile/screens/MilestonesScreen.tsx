import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  addDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseDb as db } from '../lib/firebaseClient';

// ── TYPES ─────────────────────────────────────
type Stage = 'PRENATAL' | 'POSTNATAL';
type MilestoneStatus = 'achieved' | 'pending' | 'concern';

type Milestone = {
  id:            string;
  title:         string;
  description:   string;
  weekOrAge:     string; // "Week 12" for prenatal, "4 months" for postnatal
  status:        MilestoneStatus;
  notes:         string;
  stage:         Stage;
  order:         number;
};

function normalizeStatus(value: unknown): MilestoneStatus {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'achieved' || status === 'concern') return status;
  return 'pending';
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getMotherDocIdFromEmail(value: string): string {
  return normalizeEmail(value).replace(/[^a-z0-9]/gi, '_');
}

function normalizeStageValue(value: unknown): Stage {
  const raw = String(value || '').trim().toUpperCase();
  return raw.includes('POST') ? 'POSTNATAL' : 'PRENATAL';
}

function parsePrenatalWeekTarget(label: string): number | null {
  const normalized = label.toLowerCase();
  if (normalized.includes('delivery') || normalized.includes('full term')) return 40;

  const numbers = normalized.match(/\d+/g)?.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite) || [];
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function parsePostnatalMonthTarget(label: string): number | null {
  const normalized = label.toLowerCase();
  const numbers = normalized.match(/\d+/g)?.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite) || [];
  if (numbers.length === 0) return null;

  const maxValue = Math.max(...numbers);
  if (normalized.includes('week')) {
    return Math.ceil(maxValue / 4.33);
  }

  return maxValue;
}

function isMilestoneUnlocked(item: Milestone, stage: Stage, currentWeek: number | null, currentMonths: number | null): boolean {
  if (stage === 'PRENATAL') {
    const targetWeek = parsePrenatalWeekTarget(item.weekOrAge);
    if (targetWeek === null) return true;
    return (currentWeek ?? 0) >= targetWeek;
  }

  const targetMonth = parsePostnatalMonthTarget(item.weekOrAge);
  if (targetMonth === null) return true;
  return (currentMonths ?? 0) >= targetMonth;
}

// ── DEFAULT PRENATAL MILESTONES ───────────────
const DEFAULT_PRENATAL: Omit<Milestone, 'id' | 'status' | 'notes'>[] = [
  { title: 'First ANC Visit',          description: 'First antenatal care appointment and blood tests completed.',             weekOrAge: 'Before week 12', stage: 'PRENATAL', order: 1  },
  { title: 'First Trimester Complete', description: 'Baby has all major organs forming. Risk of miscarriage drops significantly.', weekOrAge: 'Week 12',        stage: 'PRENATAL', order: 2  },
  { title: 'Anomaly Scan',             description: 'Detailed ultrasound checks baby\'s anatomy and development.',             weekOrAge: 'Week 18–20',     stage: 'PRENATAL', order: 3  },
  { title: 'Glucose Tolerance Test',   description: 'Screening for gestational diabetes.',                                    weekOrAge: 'Week 24–28',     stage: 'PRENATAL', order: 4  },
  { title: 'Third Trimester Begins',   description: 'Baby begins rapid weight gain. Birth plan should be discussed.',         weekOrAge: 'Week 28',        stage: 'PRENATAL', order: 5  },
  { title: 'Group B Strep Test',       description: 'Swab test to check for Group B Streptococcus infection.',               weekOrAge: 'Week 35–37',     stage: 'PRENATAL', order: 6  },
  { title: 'Birth Preparedness',       description: 'Hospital bag packed, birth plan confirmed, support person identified.',  weekOrAge: 'Week 36–38',     stage: 'PRENATAL', order: 7  },
  { title: 'Baby is Full Term',        description: 'Baby is ready for birth. Labour signs to watch for.',                   weekOrAge: 'Week 39–40',     stage: 'PRENATAL', order: 8  },
  { title: 'Baby Delivered',           description: 'Healthy delivery achieved. Transition to postnatal care begins.',       weekOrAge: 'Delivery',       stage: 'PRENATAL', order: 9  },
];

// ── DEFAULT POSTNATAL MILESTONES ──────────────
const DEFAULT_POSTNATAL: Omit<Milestone, 'id' | 'status' | 'notes'>[] = [
  { title: 'Smiles Responsively',         description: 'Baby smiles when talked to or smiled at — not just wind.',           weekOrAge: '6–8 weeks',   stage: 'POSTNATAL', order: 1  },
  { title: 'Lifts Head When on Tummy',    description: 'Baby can lift and hold head when placed on stomach.',                weekOrAge: '2–3 months',  stage: 'POSTNATAL', order: 2  },
  { title: 'Tracks Objects with Eyes',    description: 'Baby follows moving objects or faces with their eyes.',              weekOrAge: '2–3 months',  stage: 'POSTNATAL', order: 3  },
  { title: 'Holds Head Steady',           description: 'Baby holds head upright without support when held.',                 weekOrAge: '3–4 months',  stage: 'POSTNATAL', order: 4  },
  { title: 'Laughs and Vocalises',        description: 'Baby laughs, coos and makes conversational sounds.',                 weekOrAge: '4 months',    stage: 'POSTNATAL', order: 5  },
  { title: 'Rolls from Tummy to Back',    description: 'Baby can roll from stomach to back independently.',                  weekOrAge: '4–5 months',  stage: 'POSTNATAL', order: 6  },
  { title: 'Sits with Support',           description: 'Baby can sit upright when supported by hands or cushions.',         weekOrAge: '4–5 months',  stage: 'POSTNATAL', order: 7  },
  { title: 'Reaches and Grasps Objects',  description: 'Baby intentionally reaches for and holds objects.',                 weekOrAge: '5–6 months',  stage: 'POSTNATAL', order: 8  },
  { title: 'Sits Without Support',        description: 'Baby sits independently without any support.',                      weekOrAge: '6–7 months',  stage: 'POSTNATAL', order: 9  },
  { title: 'Responds to Own Name',        description: 'Baby turns or reacts when their name is called.',                   weekOrAge: '6–7 months',  stage: 'POSTNATAL', order: 10 },
  { title: 'Starts Solid Foods',          description: 'Complementary feeding introduced alongside breastfeeding.',         weekOrAge: '6 months',    stage: 'POSTNATAL', order: 11 },
  { title: 'Crawling',                    description: 'Baby moves on hands and knees to explore.',                         weekOrAge: '7–10 months', stage: 'POSTNATAL', order: 12 },
  { title: 'Pulls to Stand',             description: 'Baby pulls themselves to standing using furniture.',                  weekOrAge: '9–11 months', stage: 'POSTNATAL', order: 13 },
  { title: 'First Words (mama / dada)',   description: 'Baby says first recognisable words.',                                weekOrAge: '9–12 months', stage: 'POSTNATAL', order: 14 },
  { title: 'Walks with Support',          description: 'Baby walks when holding furniture or a hand.',                      weekOrAge: '10–12 months',stage: 'POSTNATAL', order: 15 },
  { title: 'Walks Independently',         description: 'Baby takes independent steps without support.',                     weekOrAge: '12–15 months',stage: 'POSTNATAL', order: 16 },
];

// ── HELPERS ───────────────────────────────────
function statusIcon(s: MilestoneStatus) {
  if (s === 'achieved') return '✅';
  if (s === 'concern')  return '⚠️';
  return '⏳';
}

function statusColors(s: MilestoneStatus, isPostnatal: boolean) {
  const accent = isPostnatal ? '#0e7490' : '#55075c';
  const rose   = isPostnatal ? '#34d399' : '#c9227a';
  if (s === 'achieved') return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#15803d' };
  if (s === 'concern')  return { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#b45309' };
  return                       { bg: '#fdfafb', border: '#EBD6ED', text: '#9CA3AF', dot: '#d1d5db' };
}

// ── SCREEN ────────────────────────────────────
interface Props {
  email?:  string;
  onBack?: () => void;
}

export default function MilestonesScreen({ onBack }: Props) {
  const auth     = getAuth();
  const motherId = auth.currentUser?.uid ?? '';

  const [stage,        setStage]        = useState<Stage>('PRENATAL');
  const [milestones,   setMilestones]   = useState<Milestone[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selected,     setSelected]     = useState<Milestone | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [newStatus,    setNewStatus]    = useState<MilestoneStatus>('achieved');
  const [newNotes,     setNewNotes]     = useState('');
  const [filter,       setFilter]       = useState<'ALL' | MilestoneStatus>('ALL');
  const [pregnancyWeek, setPregnancyWeek] = useState<number | null>(null);
  const [babyAgeMonths, setBabyAgeMonths] = useState<number | null>(null);

  const isPostnatal = stage === 'POSTNATAL';

  // ── READ ──────────────────────────────────
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    try {
      // Resolve mother profile robustly so stage is correct even with canonical email-based doc ids.
      const normalizedEmail = normalizeEmail(auth.currentUser?.email || '');
      const emailDocId = normalizedEmail ? getMotherDocIdFromEmail(normalizedEmail) : '';
      let profileData: Record<string, unknown> = {};

      const uidProfileSnap = motherId ? await getDoc(doc(db, 'mothers', motherId)) : null;
      if (uidProfileSnap?.exists()) {
        profileData = uidProfileSnap.data() as Record<string, unknown>;
      } else if (emailDocId) {
        const emailProfileSnap = await getDoc(doc(db, 'mothers', emailDocId));
        if (emailProfileSnap.exists()) {
          profileData = emailProfileSnap.data() as Record<string, unknown>;
        } else if (normalizedEmail) {
          const emailFields = ['email', 'Email', 'userEmail', 'user_email', 'motherEmail', 'mother_email'];
          for (const emailField of emailFields) {
            try {
              const byEmailSnap = await getDocs(
                query(collection(db, 'mothers'), where(emailField, '==', normalizedEmail), limit(1))
              );
              if (byEmailSnap.empty) continue;
              profileData = byEmailSnap.docs[0].data() as Record<string, unknown>;
              break;
            } catch {
              // Continue checking other email field variants.
            }
          }
        }
      }

      const profStage: Stage = normalizeStageValue(profileData.stage || profileData.motherStage);
      const weekParsed = Number.parseInt(String(profileData.pregnancyWeek || profileData.week || ''), 10);
      const babyMonthsParsed = Number.parseInt(String(profileData.babyAgeMonths || profileData.infantAgeMonths || ''), 10);

      setPregnancyWeek(Number.isNaN(weekParsed) ? null : weekParsed);
      setBabyAgeMonths(Number.isNaN(babyMonthsParsed) ? null : babyMonthsParsed);
      setStage(profStage);

      // Get saved milestones from Firebase
      const q    = query(collection(db, 'development_milestones'), where('motherId', '==', motherId));
      const snap = await getDocs(q);
      const saved: Milestone[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          title: String(data.title || 'Milestone'),
          description: String(data.description || 'No description provided.'),
          weekOrAge: String(data.weekOrAge || data.week || ''),
          status: normalizeStatus(data.status),
          notes: String(data.notes || ''),
          stage: normalizeStageValue(data.stage),
          order: Number.isFinite(Number(data.order)) ? Number(data.order) : 99,
        };
      });

      // Merge with defaults for the current stage
      const defaults = profStage === 'POSTNATAL' ? DEFAULT_POSTNATAL : DEFAULT_PRENATAL;
      const savedTitles = new Set(saved.map((m) => m.title));

      const merged: Milestone[] = defaults.map((def) => {
        const found = saved.find((m) => m.title === def.title);
        return found ?? {
          ...def,
          id:     def.title, // temp id for unsaved
          status: 'pending',
          notes:  '',
        };
      });

      // Include any extra custom milestones from DB not in defaults
      saved
        .filter((m) => m.stage === profStage && !defaults.find((d) => d.title === m.title))
        .forEach((m) => merged.push(m));

      merged.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setMilestones(merged);
    } catch (e) {
      console.log('MilestonesScreen error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { if (motherId) fetchData(); }, [motherId]);

  // ── OPEN UPDATE MODAL ─────────────────────
  const openModal = (m: Milestone) => {
    setSelected(m);
    setNewStatus(m.status);
    setNewNotes(m.notes ?? '');
    setModalVisible(true);
  };

  // ── CREATE or UPDATE ──────────────────────
  const saveMilestone = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // Check if already saved in Firebase
      const q    = query(collection(db, 'development_milestones'), where('motherId', '==', motherId), where('title', '==', selected.title));
      const snap = await getDocs(q);

      if (!snap.empty) {
        // UPDATE
        await updateDoc(doc(db, 'development_milestones', snap.docs[0].id), {
          status: newStatus, notes: newNotes, updatedAt: serverTimestamp(),
        });
      } else {
        // CREATE
        await addDoc(collection(db, 'development_milestones'), {
          motherId,
          title:       selected.title,
          description: selected.description,
          weekOrAge:   selected.weekOrAge,
          stage,
          order:       selected.order,
          status:      newStatus,
          notes:       newNotes,
          createdAt:   serverTimestamp(),
        });
      }

      setMilestones((prev) =>
        prev.map((m) =>
          m.title === selected.title ? { ...m, status: newStatus, notes: newNotes } : m
        )
      );
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save milestone.');
    } finally {
      setSaving(false);
    }
  };

  const unlockedMilestones = milestones.filter((item) => isMilestoneUnlocked(item, stage, pregnancyWeek, babyAgeMonths));

  // ── FILTERED LIST ─────────────────────────
  const displayed = filter === 'ALL' ? unlockedMilestones : unlockedMilestones.filter((m) => m.status === filter);

  const achieved = unlockedMilestones.filter((m) => m.status === 'achieved').length;
  const concerns = unlockedMilestones.filter((m) => m.status === 'concern').length;
  const pending  = unlockedMilestones.filter((m) => m.status === 'pending').length;
  const pct      = unlockedMilestones.length ? Math.round((achieved / unlockedMilestones.length) * 100) : 0;
  const hiddenFutureCount = Math.max(milestones.length - unlockedMilestones.length, 0);
  const stageLevel = achieved + 1;

  const heroBg     = '#3a0440';
  const heroAccent = '#f5b8e8';
  const accentCol  = '#55075c';
  const roseCol    = '#c9227a';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#55075c" />
        <Text style={styles.loadingText}>Loading milestones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.heroTitle}>
          {isPostnatal ? '🌱 Postnatal Milestones' : '🤰 Prenatal Milestones'}
        </Text>
        <Text style={[styles.heroSub, { color: heroAccent + 'bb' }]}>
          {isPostnatal
            ? 'Track your baby\'s developmental achievements month by month'
            : 'Track key pregnancy milestones from conception to delivery'
          }
        </Text>

        <View style={styles.stageGameRow}>
          <View style={[styles.stageGameChip, { borderColor: heroAccent + '66' }]}>
            <Text style={[styles.stageGameChipText, { color: heroAccent }]}>Level {stageLevel}</Text>
          </View>
          <Text style={[styles.stageGameText, { color: heroAccent + 'cc' }]}>
            {isPostnatal
              ? `You are at month ${babyAgeMonths ?? 0} and unlocked ${unlockedMilestones.length} milestones`
              : `You are at week ${pregnancyWeek ?? 0} and unlocked ${unlockedMilestones.length} milestones`}
          </Text>
        </View>

        {/* PROGRESS */}
        <View style={styles.heroProgress}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: roseCol }]} />
          </View>
          <Text style={[styles.progressPct, { color: heroAccent }]}>{pct}% complete</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        onScrollEndDrag={() => fetchData(true)}
      >

        {/* SUMMARY CARDS */}
        <View style={styles.summaryRow}>
          <TouchableOpacity
            style={[styles.summaryCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }, filter === 'achieved' && styles.summaryCardActive]}
            onPress={() => setFilter(filter === 'achieved' ? 'ALL' : 'achieved')}
          >
            <Text style={styles.summaryIcon}>✅</Text>
            <Text style={[styles.summaryVal, { color: '#15803d' }]}>{achieved}</Text>
            <Text style={[styles.summaryLbl, { color: '#15803d' }]}>Achieved</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.summaryCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }, filter === 'concern' && styles.summaryCardActive]}
            onPress={() => setFilter(filter === 'concern' ? 'ALL' : 'concern')}
          >
            <Text style={styles.summaryIcon}>⚠️</Text>
            <Text style={[styles.summaryVal, { color: '#b45309' }]}>{concerns}</Text>
            <Text style={[styles.summaryLbl, { color: '#b45309' }]}>Concerns</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.summaryCard, { backgroundColor: '#fdf5f9', borderColor: '#EBD6ED' }, filter === 'pending' && styles.summaryCardActive]}
            onPress={() => setFilter(filter === 'pending' ? 'ALL' : 'pending')}
          >
            <Text style={styles.summaryIcon}>⏳</Text>
            <Text style={[styles.summaryVal, { color: '#9CA3AF' }]}>{pending}</Text>
            <Text style={[styles.summaryLbl, { color: '#9CA3AF' }]}>Upcoming</Text>
          </TouchableOpacity>
        </View>

        {/* HINT */}
        <Text style={styles.hint}>Tap milestone cards to mark progress. Future milestones are hidden until you reach them.</Text>

        {hiddenFutureCount > 0 ? (
          <View style={styles.futureHintCard}>
            <Text style={styles.futureHintText}>{hiddenFutureCount} future milestone{hiddenFutureCount === 1 ? '' : 's'} will unlock as you advance.</Text>
          </View>
        ) : null}

        {/* MILESTONE LIST */}
        {displayed.map((item, index) => {
          const colors = statusColors(item.status, isPostnatal);
          return (
            <TouchableOpacity
              key={item.title}
              style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}
              onPress={() => openModal(item)}
              activeOpacity={0.8}
            >
              {/* ORDER + STATUS ROW */}
              <View style={styles.cardTop}>
                <View style={[styles.orderBadge, { backgroundColor: accentCol + '18' }]}>
                  <Text style={[styles.orderText, { color: accentCol }]}>{item.order ?? index + 1}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <View style={[styles.weekPill, { backgroundColor: accentCol + '15' }]}>
                    <Text style={[styles.weekText, { color: accentCol }]}>{item.weekOrAge}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: colors.bg, borderColor: colors.dot }]}>
                    <Text style={styles.statusIcon}>{statusIcon(item.status)}</Text>
                    <Text style={[styles.statusText, { color: colors.text }]}>{item.status}</Text>
                  </View>
                </View>
              </View>

              {/* CONTENT */}
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>

              {item.notes ? (
                <View style={[styles.notesBox, { borderColor: colors.border }]}>
                  <Text style={styles.notesLabel}>Your note</Text>
                  <Text style={styles.notesText}>{item.notes}</Text>
                </View>
              ) : null}

            </TouchableOpacity>
          );
        })}

        {displayed.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>{isPostnatal ? '👶' : '🤰'}</Text>
            <Text style={styles.emptyTitle}>No milestones in this category</Text>
            <TouchableOpacity onPress={() => setFilter('ALL')}>
              <Text style={[styles.emptyLink, { color: accentCol }]}>Show all →</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* UPDATE MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{selected?.title}</Text>
            <Text style={styles.modalSub}>{selected?.weekOrAge}</Text>
            <Text style={styles.modalDesc}>{selected?.description}</Text>

            {/* STATUS BUTTONS */}
            <Text style={styles.modalLabel}>Status</Text>
            <View style={styles.statusRow}>
              {(['achieved', 'pending', 'concern'] as MilestoneStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusBtn,
                    newStatus === s
                      ? {
                          backgroundColor: s === 'achieved' ? '#15803d' : s === 'concern' ? '#b45309' : '#55075c',
                          borderColor: s === 'achieved' ? '#15803d' : s === 'concern' ? '#b45309' : '#55075c',
                        }
                      : null,
                  ]}
                  onPress={() => setNewStatus(s)}
                >
                  <Text style={styles.statusBtnIcon}>{statusIcon(s)}</Text>
                  <Text style={[styles.statusBtnText, newStatus === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* NOTES */}
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Any observations or concerns..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={newNotes}
              onChangeText={setNewNotes}
            />

            {/* BUTTONS */}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accentCol }, saving && styles.btnDisabled]}
                onPress={saveMilestone}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── STYLES ───────────────────────────────────
const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8FAFC' },
  centered:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:        { marginTop: 12, fontSize: 14, color: '#6B7280' },

  // HERO
  hero:               { paddingTop: 52, paddingBottom: 24, paddingHorizontal: 20 },
  backBtn:            { marginBottom: 12 },
  backBtnText:        { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  heroTitle:          { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroSub:            { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  stageGameRow:       { marginBottom: 12 },
  stageGameChip:      { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, marginBottom: 6 },
  stageGameChipText:  { fontSize: 11, fontWeight: '800' },
  stageGameText:      { fontSize: 12, fontWeight: '600' },
  heroProgress:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack:      { flex: 1, height: 7, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' },
  progressFill:       { height: '100%', borderRadius: 4 },
  progressPct:        { fontSize: 13, fontWeight: '700', minWidth: 70, textAlign: 'right' },

  // CONTENT
  content:            { padding: 18, paddingBottom: 50 },

  // SUMMARY
  summaryRow:         { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryCard:        { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center' },
  summaryCardActive:  { borderWidth: 2.5 },
  summaryIcon:        { fontSize: 20, marginBottom: 4 },
  summaryVal:         { fontSize: 22, fontWeight: '800' },
  summaryLbl:         { fontSize: 11, fontWeight: '700', marginTop: 2 },

  hint:               { fontSize: 12, color: '#9CA3AF', marginBottom: 14, textAlign: 'center' },
  futureHintCard:     { borderRadius: 12, borderWidth: 1, borderColor: '#EBD6ED', backgroundColor: '#fff', padding: 12, marginBottom: 12 },
  futureHintText:     { fontSize: 12, color: '#6B7280', textAlign: 'center' },

  // CARD
  card:               { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTop:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  orderBadge:         { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  orderText:          { fontSize: 13, fontWeight: '800' },
  cardMeta:           { flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' },
  weekPill:           { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  weekText:           { fontSize: 11, fontWeight: '700' },
  statusPill:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusIcon:         { fontSize: 12 },
  statusText:         { fontSize: 11, fontWeight: '700' },
  cardTitle:          { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  cardDesc:           { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 10 },
  notesBox:           { borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 8 },
  notesLabel:         { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  notesText:          { fontSize: 13, color: '#374151', lineHeight: 17 },
  // EMPTY
  emptyWrap:          { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:          { fontSize: 40, marginBottom: 10, opacity: 0.5 },
  emptyTitle:         { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 10 },
  emptyLink:          { fontSize: 14, fontWeight: '700' },

  // MODAL
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:           { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 26, paddingBottom: 44 },
  modalTitle:         { fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  modalSub:           { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  modalDesc:          { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 18, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10 },
  modalLabel:         { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  statusRow:          { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statusBtn:          { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EBD6ED', alignItems: 'center', backgroundColor: '#fdfafb' },
  statusBtnIcon:      { fontSize: 18, marginBottom: 4 },
  statusBtnText:      { fontSize: 12, fontWeight: '700', color: '#374151' },
  textArea:           { borderWidth: 1, borderColor: '#EBD6ED', borderRadius: 12, padding: 12, fontSize: 14, color: '#1a1a2e', minHeight: 90, textAlignVertical: 'top', marginBottom: 18 },
  modalBtns:          { flexDirection: 'row', gap: 12 },
  cancelBtn:          { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EBD6ED', alignItems: 'center' },
  cancelBtnText:      { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  saveBtn:            { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText:        { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnDisabled:        { opacity: 0.6 },
});
