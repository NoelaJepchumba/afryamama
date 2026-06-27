import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
  where,
} from 'firebase/firestore';
import { firebaseDb as db } from '../lib/firebaseClient';
import { fetchNotifications as fetchMotherNotifications } from '../lib/firestoreData';

// ── TYPES ─────────────────────────────────────
type Stage = 'PRENATAL' | 'POSTNATAL';

type Profile = {
  fullName:              string;
  stage:                 Stage;
  pregnancyWeek:         string;
  babyAgeMonths:         string;
  motherCode:            string;
  county:                string;
  facility:              string;
  assignedDoctorName?:   string;
  assignedDoctorFacility?: string;
  emergencyContactName:  string;
  emergencyContactPhone: string;
  email?:                string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getMotherDocIdFromEmail(value: string): string {
  return normalizeEmail(value).replace(/[^a-z0-9]/gi, '_');
}

type Appointment  = { id: string; appointmentType: string; appointmentDate: string; status: string; };
type Notification = {
  id: string;
  read: boolean;
  title?: string;
  message?: string;
  date?: string;
  type?: string;
  senderRole?: string;
  role?: string;
  createdByRole?: string;
  audience?: string;
  createdAt?: string;
};
type Vaccine      = { id: string; status: string; scheduledWeeks: number; };
type HealthRecord = { id: string; bp: string; };
type QuickAction  = { id: string; screen: string; icon: string; title: string; desc: string; color: string; stage: 'PRENATAL' | 'POSTNATAL' | 'ALL'; enabled: boolean; order: number; };
type TipItem      = { id: string; title: string; content: string; audience: string; stage: 'PRENATAL' | 'POSTNATAL' | 'ALL'; order: number; };

const PRENATAL_REQUIRED_ACTIONS: QuickAction[] = [
  { id: 'fallback-prenatal-appointments', screen: 'APPOINTMENTS', icon: '📅', title: 'Appointments', desc: 'ANC visits', color: '#7c3aed', stage: 'PRENATAL', enabled: true, order: 1 },
  { id: 'fallback-prenatal-records', screen: 'RECORDS', icon: '📋', title: 'Health Reports', desc: 'Checkup history', color: '#c9227a', stage: 'PRENATAL', enabled: true, order: 2 },
  { id: 'fallback-prenatal-milestones', screen: 'MILESTONES', icon: '🎯', title: 'Milestones', desc: 'Pregnancy goals', color: '#0e7490', stage: 'PRENATAL', enabled: true, order: 3 },
  { id: 'fallback-prenatal-notifications', screen: 'NOTIFICATIONS', icon: '🔔', title: 'Notifications', desc: 'Reminders & alerts', color: '#b45309', stage: 'PRENATAL', enabled: true, order: 4 },
  { id: 'fallback-prenatal-wellness', screen: 'WELLNESS', icon: '📚', title: 'What to Know', desc: 'Pregnancy tips', color: '#1a7f4e', stage: 'PRENATAL', enabled: true, order: 5 },
  { id: 'fallback-prenatal-profile', screen: 'PROFILE', icon: '👤', title: 'My Profile', desc: 'Account details', color: '#55075c', stage: 'PRENATAL', enabled: true, order: 6 },
];

const POSTNATAL_REQUIRED_ACTIONS: QuickAction[] = [
  { id: 'fallback-postnatal-immunization', screen: 'IMMUNIZATION', icon: '💉', title: 'Immunizations', desc: 'Vaccine schedule', color: '#1a7f4e', stage: 'POSTNATAL', enabled: true, order: 1 },
  { id: 'fallback-postnatal-growth', screen: 'GROWTH', icon: '📈', title: 'Growth Charts', desc: 'Baby development', color: '#0e7490', stage: 'POSTNATAL', enabled: true, order: 2 },
  { id: 'fallback-postnatal-appointments', screen: 'APPOINTMENTS', icon: '📅', title: 'Appointments', desc: 'PNC visits', color: '#7c3aed', stage: 'POSTNATAL', enabled: true, order: 3 },
  { id: 'fallback-postnatal-records', screen: 'RECORDS', icon: '📋', title: 'Health Reports', desc: 'Mother records', color: '#c9227a', stage: 'POSTNATAL', enabled: true, order: 4 },
  { id: 'fallback-postnatal-milestones', screen: 'MILESTONES', icon: '⭐', title: 'Milestones', desc: 'Baby milestones', color: '#be185d', stage: 'POSTNATAL', enabled: true, order: 5 },
  { id: 'fallback-postnatal-notifications', screen: 'NOTIFICATIONS', icon: '🔔', title: 'Notifications', desc: 'Reminders & alerts', color: '#b45309', stage: 'POSTNATAL', enabled: true, order: 6 },
  { id: 'fallback-postnatal-wellness', screen: 'WELLNESS', icon: '📚', title: 'What to Know', desc: 'Recovery tips', color: '#55075c', stage: 'POSTNATAL', enabled: true, order: 7 },
  { id: 'fallback-postnatal-profile', screen: 'PROFILE', icon: '👤', title: 'My Profile', desc: 'Account details', color: '#374151', stage: 'POSTNATAL', enabled: true, order: 8 },
];

function normalizeStage(value: string): 'PRENATAL' | 'POSTNATAL' | 'ALL' {
  const stage = value.trim().toUpperCase();
  if (stage === 'PRENATAL' || stage === 'POSTNATAL') return stage;
  return 'ALL';
}

function normalizeScreenName(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'IMMUNIZATIONS') return 'IMMUNIZATION';
  if (normalized === 'HEALTH_REPORTS' || normalized === 'HEALTH REPORTS') return 'RECORDS';
  return normalized;
}

// ── MINI COMPONENTS ───────────────────────────
function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusPillLabel}>{label}</Text>
      <Text style={styles.statusPillValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function GridTile({
  item, badge, onPress,
}: {
  item: QuickAction; badge?: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.gridCard} onPress={onPress} activeOpacity={0.8}>
      {badge ? (
        <View style={styles.pingBadge}>
          <Text style={styles.pingBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
      <View style={[styles.gridIconBg, { backgroundColor: item.color + '1a' }]}>
        <Text style={styles.gridIcon}>{item.icon}</Text>
      </View>
      <Text style={styles.gridTitle}>{item.title}</Text>
      <Text style={styles.gridDesc}>{item.desc}</Text>
    </TouchableOpacity>
  );
}

function SkeletonBox({ h, mb }: { h: number; mb?: number }) {
  return <View style={[styles.skeletonBase, { height: h, marginBottom: mb ?? 12 }]} />;
}

// ── SCREEN ────────────────────────────────────
interface Props {
  userEmail?:           string;
  userName?:            string;
  pregnancyWeek?:       number | null;
  nextAppointmentText?: string | null;
  onNavigate:           (screen: string) => void;
  onLogout:             () => void;
}

export default function MotherDashboardScreen({
  pregnancyWeek: propWeek,
  nextAppointmentText,
  onNavigate,
  onLogout,
}: Props) {
  const auth     = getAuth();
  const motherId = auth.currentUser?.uid ?? '';

  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [appointments,  setAppointments]  = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [vaccines,      setVaccines]      = useState<Vaccine[]>([]);
  const [records,       setRecords]       = useState<HealthRecord[]>([]);
  const [quickActions,  setQuickActions]  = useState<QuickAction[]>([]);
  const [tips,          setTips]          = useState<TipItem[]>([]);
  const [loading,       setLoading]       = useState(true);

  // ── FETCH ──────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const normalizedEmail = normalizeEmail(auth.currentUser?.email || '');
        const emailDocId = normalizedEmail ? getMotherDocIdFromEmail(normalizedEmail) : '';

        const [uidProfileSnap, emailProfileSnap, apptSnap, vaxSnap, recSnap] = await Promise.all([
          getDoc(doc(db, 'mothers', motherId)),
          emailDocId ? getDoc(doc(db, 'mothers', emailDocId)) : Promise.resolve(null),
          getDocs(query(collection(db, 'appointments'),   where('motherId', '==', motherId))),
          getDocs(query(collection(db, 'vaccinations'),   where('motherId', '==', motherId))),
          getDocs(query(collection(db, 'health_records'), where('motherId', '==', motherId))),
        ]);

        const fetchedNotifications = normalizedEmail
          ? await fetchMotherNotifications(normalizedEmail)
          : [];

        let resolvedProfile: Profile | null = null;
        if (uidProfileSnap.exists()) {
          resolvedProfile = uidProfileSnap.data() as Profile;
        } else if (emailProfileSnap && emailProfileSnap.exists()) {
          resolvedProfile = emailProfileSnap.data() as Profile;
        } else if (normalizedEmail) {
          const emailFields = ['email', 'Email', 'userEmail', 'user_email', 'motherEmail', 'mother_email'];

          for (const emailField of emailFields) {
            try {
              const byEmail = await getDocs(
                query(collection(db, 'mothers'), where(emailField, '==', normalizedEmail), limit(1))
              );
              if (byEmail.empty) continue;
              resolvedProfile = byEmail.docs[0].data() as Profile;
              break;
            } catch {
              // Try other field variants.
            }
          }
        }

        if (resolvedProfile) setProfile(resolvedProfile);
        setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Appointment[]);
        setNotifications(
          fetchedNotifications.map((item) => ({
            id: item.id,
            read: item.read,
            title: item.title,
            message: item.message,
            date: item.date,
            type: item.type,
          }))
        );
        setVaccines(vaxSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Vaccine[]);
        setRecords(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as HealthRecord[]);
      } catch (e) {
        console.log('Dashboard error:', e);
      } finally {
        setLoading(false);
      }
    };
    if (motherId) fetchAll();
  }, [motherId]);

  // ── DERIVED ───────────────────────────────
  const isPostnatalView = useMemo(() => {
    if (profile?.stage === 'POSTNATAL') return true;
    const wk = propWeek ?? parseInt(profile?.pregnancyWeek ?? '', 10);
    return !isNaN(wk) && wk >= 40;
  }, [profile, propWeek]);

  const pregnancyWeekNum = useMemo(() => {
    const n = propWeek ?? parseInt(profile?.pregnancyWeek ?? '', 10);
    return isNaN(n) ? null : n;
  }, [profile, propWeek]);

  const babyMonthsNum = useMemo(() => {
    const n = parseInt(profile?.babyAgeMonths ?? '', 10);
    return isNaN(n) ? null : n;
  }, [profile]);

  const progressPct = isPostnatalView
    ? babyMonthsNum ? Math.min((babyMonthsNum / 24) * 100, 100) : 0
    : pregnancyWeekNum ? Math.min((pregnancyWeekNum / 40) * 100, 100) : 0;

  const autoTransition = !isNaN(pregnancyWeekNum ?? NaN) && (pregnancyWeekNum ?? 0) >= 40 && profile?.stage !== 'POSTNATAL';

  const unread = notifications.filter((n) => !n.read).length;

  const nextAppt = useMemo(() => {
    const now = new Date();
    const src  = nextAppointmentText;
    if (src) return src;
    const up = appointments
      .filter((a) => new Date(a.appointmentDate) >= now && a.status !== 'cancelled' && a.status !== 'completed')
      .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
    if (!up.length) return null;
    return new Date(up[0].appointmentDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [appointments, nextAppointmentText]);

  const completedAppts    = appointments.filter((a) => a.status === 'completed').length;
  const overdueVaxCount   = vaccines.filter((v) => v.status !== 'COMPLETED' && babyMonthsNum && (babyMonthsNum * 4.33) > v.scheduledWeeks).length;
  const completedVaxCount = vaccines.filter((v) => v.status === 'COMPLETED').length;

  const bpRisk = useMemo(() => {
    const high = records.filter((r) => {
      const m = r.bp?.match(/(\d+)\D+(\d+)/);
      if (!m) return false;
      return parseInt(m[1], 10) >= 140 || parseInt(m[2], 10) >= 90;
    }).length;
    if (high >= 2) return { msg: 'High BP pattern in multiple checkups — contact your clinic.', level: 'danger' };
    if (high === 1) return { msg: 'One high BP reading found — keep monitoring.',                level: 'warn'   };
    return              { msg: 'No blood pressure risk pattern detected.',                        level: 'ok'     };
  }, [records]);

  const greetingName = (profile?.fullName ?? auth.currentUser?.displayName ?? 'Mama').split(' ')[0];
  const initials     = (name: string) => name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const stageLabel     = isPostnatalView ? 'Postnatal' : 'Prenatal';
  const progressColor  = '#c9227a';
  const heroBg         = '#3a0440';
  const heroAccent     = '#f5b8e8';
  const ringColor      = '#c9227a';
  const tipBg          = '#fdf5f9';
  const tipBorder      = '#EBD6ED';
  const tipColor       = '#3a0440';
  const currentStage   = isPostnatalView ? 'POSTNATAL' : 'PRENATAL';

  const stageTips = useMemo(() => {
    return tips
      .filter((item) => item.stage === 'ALL' || item.stage === currentStage)
      .sort((a, b) => a.order - b.order);
  }, [tips, currentStage]);

  const latestAdminNotificationTip = useMemo(() => {
    const parseTime = (value: string | undefined): number => {
      if (!value) return 0;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };

    const now = new Date();
    const isToday = (value: string | undefined): boolean => {
      if (!value) return false;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed.toDateString() === now.toDateString();
    };

    const withText = notifications
      .map((item) => {
        const text = (item.message || item.title || '').trim();
        if (!text) return null;

        const dateSource = item.createdAt || item.date;

        return {
          text,
          today: isToday(dateSource),
          unread: !item.read,
          time: Math.max(parseTime(item.createdAt), parseTime(item.date)),
        };
      })
      .filter((item): item is { text: string; today: boolean; unread: boolean; time: number } => Boolean(item));

    if (withText.length === 0) return null;

    const ranked = withText
      .sort((a, b) => b.time - a.time)
      .sort((a, b) => Number(b.unread) - Number(a.unread))
      .sort((a, b) => Number(b.today) - Number(a.today));

    return ranked[0]?.text || null;
  }, [notifications]);

  const todayTip = useMemo(() => {
    if (latestAdminNotificationTip) return latestAdminNotificationTip;
    if (!stageTips.length) return null;
    const day = new Date().getDay();
    return stageTips[day % stageTips.length].content;
  }, [stageTips, latestAdminNotificationTip]);

  const spotlightItems = useMemo(() => {
    const rows = stageTips
      .map((item) => item.title || item.content)
      .filter((item) => Boolean(item && item.trim()))
      .slice(0, 3);
    return rows;
  }, [stageTips]);

  const menu = useMemo(() => {
    const fromDb = quickActions
      .filter((item) => item.enabled)
      .filter((item) => item.stage === 'ALL' || item.stage === currentStage)
      .map((item) => ({
        ...item,
        screen: normalizeScreenName(item.screen),
      }))
      .filter((item) => item.screen !== 'TIMELINE' && item.screen !== 'SCHEDULE')
      .sort((a, b) => a.order - b.order);

    const required = currentStage === 'POSTNATAL' ? POSTNATAL_REQUIRED_ACTIONS : PRENATAL_REQUIRED_ACTIONS;
    const byScreen = new Map<string, QuickAction>();

    fromDb.forEach((item) => {
      byScreen.set(item.screen, item);
    });

    required.forEach((item) => {
      if (!byScreen.has(item.screen)) {
        byScreen.set(item.screen, item);
      }
    });

    return Array.from(byScreen.values()).sort((a, b) => a.order - b.order);
  }, [quickActions, currentStage]);

  const stageHeader = isPostnatalView
    ? babyMonthsNum ? `${babyMonthsNum} month${babyMonthsNum !== 1 ? 's' : ''} postpartum` : 'Postnatal care'
    : pregnancyWeekNum ? `Week ${pregnancyWeekNum} of 40` : 'Pregnancy tracking pending';

  async function handleNavigate(screen: string) {
    if (screen === 'NOTIFICATIONS' && motherId) {
      try {
        const unreadDocs = notifications.filter((item) => !item.read);

        if (unreadDocs.length > 0) {
          setNotifications((current) => current.map((item) => ({ ...item, read: true })));

          const snapshot = await getDocs(
            query(collection(db, 'notifications'), where('motherId', '==', motherId))
          );

          const updates = snapshot.docs
            .filter((item) => item.data().read !== true)
            .map((item) => updateDoc(doc(db, 'notifications', item.id), { read: true }));

          if (updates.length > 0) {
            await Promise.all(updates);
          }
        }
      } catch {
        // Continue navigation even if notification read update fails.
      }
    }

    onNavigate(screen);
  }

  useEffect(() => {
    const fetchDynamicContent = async () => {
      try {
        const quickActionCollections = ['quick_actions', 'quickActions', 'app_quick_actions'];
        let loadedQuickActions: QuickAction[] = [];

        for (const name of quickActionCollections) {
          try {
            const snap = await getDocs(collection(db, name));
            if (snap.empty) continue;

            loadedQuickActions = snap.docs.map((item, index) => {
              const data = item.data() as Record<string, unknown>;
              const rawStage = String(data.stage || data.targetStage || 'ALL');
              const rawOrder = Number(data.order);

              return {
                id: item.id,
                screen: String(data.screen || data.route || '').toUpperCase(),
                icon: String(data.icon || '✨'),
                title: String(data.title || 'Action'),
                desc: String(data.description || data.desc || ''),
                color: String(data.color || '#55075c'),
                stage: normalizeStage(rawStage),
                enabled: data.enabled === false ? false : true,
                order: Number.isFinite(rawOrder) ? rawOrder : index,
              };
            }).filter((item) => item.screen);

            if (loadedQuickActions.length) break;
          } catch {
            // Check next collection variant.
          }
        }

        setQuickActions(loadedQuickActions);

        const tipCollections = ['mch_booklet_tips', 'mchBookletTips', 'wellness_tips', 'wellnessTips'];
        let loadedTips: TipItem[] = [];

        for (const name of tipCollections) {
          try {
            const snap = await getDocs(collection(db, name));
            if (snap.empty) continue;

            loadedTips = snap.docs.map((item, index) => {
              const data = item.data() as Record<string, unknown>;
              const rawStage = String(data.stage || data.targetStage || 'ALL');
              const rawAudience = String(data.audience || data.role || data.target || 'MOTHER').toUpperCase();
              const rawOrder = Number(data.order);

              return {
                id: item.id,
                title: String(data.title || ''),
                content: String(data.message || data.content || data.body || ''),
                audience: rawAudience,
                stage: normalizeStage(rawStage),
                order: Number.isFinite(rawOrder) ? rawOrder : index,
              };
            }).filter((item) => item.content && (item.audience === 'ALL' || item.audience === 'MOTHER'));

            if (loadedTips.length) break;
          } catch {
            // Check next collection variant.
          }
        }

        setTips(loadedTips);
      } catch {
        setQuickActions([]);
        setTips([]);
      }
    };

    if (motherId) fetchDynamicContent();
  }, [motherId]);

  // ── LOADING ───────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.hero, { backgroundColor: '#3a0440' }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.skeletonAvatar} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBox h={14} mb={6} />
              <SkeletonBox h={20} mb={0} />
            </View>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.skeletonStripRow}>
            <SkeletonBox h={52} mb={0} />
            <SkeletonBox h={52} mb={0} />
            <SkeletonBox h={52} mb={0} />
            <SkeletonBox h={52} mb={0} />
          </View>
          <SkeletonBox h={160} mb={14} />
          <SkeletonBox h={100} mb={14} />
          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBox key={i} h={110} mb={12} />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── NO PROFILE ────────────────────────────
  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyStateTitle}>Complete your profile</Text>
        <Text style={styles.emptyStateText}>Add your care details to unlock your dashboard.</Text>
        <TouchableOpacity style={styles.emptyStateButton} onPress={() => onNavigate('PROFILE')}>
          <Text style={styles.emptyStateButtonText}>Open Profile →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── HERO ── */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        <View style={styles.heroTopRow}>
          <View style={[styles.heroAvatar, { borderColor: heroAccent }]}>
            <Text style={styles.heroAvatarText}>{initials(profile.fullName)}</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroGreeting}>Jambo,</Text>
            <Text style={styles.heroName}>{greetingName} 👋</Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={onLogout}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* STAGE CHIP */}
        <View style={[styles.stagePill, { backgroundColor: heroAccent + '22', borderColor: heroAccent + '55' }]}>
          <Text style={[styles.stagePillEmoji]}>{isPostnatalView ? '🌱' : '🤰'}</Text>
          <View>
            <Text style={[styles.stagePillLabel, { color: heroAccent }]}>{stageLabel} care</Text>
            <Text style={[styles.stagePillSub, { color: heroAccent + 'bb' }]}>{stageHeader}</Text>
          </View>
          <View style={styles.stageChipRight}>
            <Text style={[styles.stagePct, { color: heroAccent }]}>{Math.round(progressPct)}%</Text>
          </View>
        </View>

        {/* PROGRESS */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPct}%` as any, backgroundColor: progressColor }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabelText}>{isPostnatalView ? 'Birth' : 'Conception'}</Text>
          <Text style={styles.progressLabelText}>{isPostnatalView ? '24 months' : 'Due date'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ── AUTO-TRANSITION NOTICE ── */}
        {autoTransition && (
          <View style={styles.transitionCard}>
            <Text style={styles.transitionTitle}>🎉 You have reached your due-date milestone.</Text>
            <Text style={styles.transitionBody}>Your dashboard has switched to postnatal view. Complete your profile to continue.</Text>
            <TouchableOpacity style={styles.transitionBtn} onPress={() => onNavigate('PROFILE')}>
              <Text style={styles.transitionBtnText}>Update Profile →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STAT STRIP ── */}
        <View style={styles.statusStrip}>
          <StatPill label="Next visit"  value={nextAppt ?? 'None booked'} />
          <StatPill label="Stage"       value={stageLabel} />
          <StatPill label="🔔 Alerts"   value={String(unread)} />
          <StatPill label={isPostnatalView ? 'Vaccines' : 'Visits done'} value={isPostnatalView ? String(completedVaxCount) : String(completedAppts)} />
        </View>

        {/* ── TODAY'S TIP ── */}
        <View style={[styles.tipCard, { backgroundColor: tipBg, borderColor: tipBorder }]}>
          <Text style={[styles.tipTag, { color: isPostnatalView ? '#0e7490' : '#55075c' }]}>
            💡 TODAY'S TIP
          </Text>
          <Text style={[styles.tipText, { color: tipColor }]}>{todayTip || 'No tip published yet.'}</Text>
        </View>

        {/* ── BP RISK ── */}
        <View style={[
          styles.bpCard,
          bpRisk.level === 'danger' ? styles.bpDanger :
          bpRisk.level === 'warn'   ? styles.bpWarn   : styles.bpOk,
        ]}>
          <Text style={styles.bpIcon}>
            {bpRisk.level === 'danger' ? '⚠️' : bpRisk.level === 'warn' ? '🔶' : '✅'}
          </Text>
          <Text style={styles.bpText}>{bpRisk.msg}</Text>
        </View>

        {/* ── DOCTOR CARD ── */}
        {profile.assignedDoctorName ? (
          <View style={styles.doctorCard}>
            <Text style={styles.doctorTag}>YOUR CARE TEAM</Text>
            <View style={styles.doctorRow}>
              <View style={[styles.doctorAvatar, { backgroundColor: isPostnatalView ? '#ecfeff' : '#fdf5f9' }]}>
                <Text style={[styles.doctorAvatarText, { color: isPostnatalView ? '#0e7490' : '#55075c' }]}>
                  {initials(profile.assignedDoctorName)}
                </Text>
              </View>
              <View>
                <Text style={styles.doctorName}>
                  {/^dr\.?\s/i.test(profile.assignedDoctorName) ? profile.assignedDoctorName : `Dr. ${profile.assignedDoctorName}`}
                </Text>
                <Text style={styles.doctorFacility}>{profile.assignedDoctorFacility || profile.facility || 'Facility not set'}</Text>
                <Text style={styles.doctorCode}>Mother code: {profile.motherCode || '—'}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── QUICK ACTIONS GRID ── */}
        <Text style={styles.sectionTitle}>My Services</Text>
        <View style={styles.grid}>
          {menu.map((item) => (
            <GridTile
              key={item.id}
              item={item}
              badge={item.screen === 'NOTIFICATIONS' && unread > 0 ? unread : undefined}
              onPress={() => handleNavigate(item.screen)}
            />
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ── STYLES ───────────────────────────────────
const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#F8FAFC' },
  centered:             { justifyContent: 'center', alignItems: 'center', padding: 32 },
  content:              { padding: 18, paddingBottom: 50 },

  // HERO
  hero:                 { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  heroTopRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  heroAvatar:           { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, flexShrink: 0 },
  heroAvatarText:       { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroText:             { flex: 1 },
  heroGreeting:         { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  heroName:             { fontSize: 20, fontWeight: '800', color: '#fff' },
  signOutBtn:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.08)' },
  signOutText:          { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },

  stagePill:            { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  stagePillEmoji:       { fontSize: 20 },
  stagePillLabel:       { fontSize: 13, fontWeight: '700' },
  stagePillSub:         { fontSize: 11, marginTop: 1 },
  stageChipRight:       { marginLeft: 'auto' },
  stagePct:             { fontSize: 20, fontWeight: '800' },

  progressTrack:        { height: 7, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar:          { height: '100%', borderRadius: 4 },
  progressLabels:       { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabelText:    { fontSize: 11, color: 'rgba(255,255,255,0.55)' },

  // TRANSITION
  transitionCard:       { backgroundColor: '#f0fdf4', borderRadius: 14, borderWidth: 1, borderColor: '#86efac', padding: 14, marginBottom: 14 },
  transitionTitle:      { color: '#166534', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  transitionBody:       { color: '#166534', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  transitionBtn:        { alignSelf: 'flex-start', backgroundColor: '#16a34a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  transitionBtnText:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // STAT STRIP
  statusStrip:          { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statusPill:           { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EBD6ED', borderRadius: 12, padding: 10 },
  statusPillLabel:      { color: '#9CA3AF', fontSize: 10, fontWeight: '600', marginBottom: 3 },
  statusPillValue:      { color: '#1a1a2e', fontSize: 12, fontWeight: '700' },

  // JOURNEY RING
  journeyCard:          { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#EBD6ED', padding: 18, marginBottom: 14 },
  journeyCardTitle:     { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 14 },
  journeyRow:           { flexDirection: 'row', alignItems: 'center', gap: 18 },
  journeyRingOuter:     { width: 96, height: 96, borderRadius: 48, borderWidth: 7, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  journeyRingInner:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  journeyRingValue:     { fontSize: 20, fontWeight: '800' },
  journeyRingSub:       { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  journeyMeta:          { flex: 1 },
  journeyMetaMain:      { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  journeyMetaSub:       { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },
  winsRow:              { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  winsBadge:            { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  winsBadgeText:        { fontSize: 11, fontWeight: '700' },
  overdueBadge:         { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  overdueBadgeText:     { fontSize: 11, fontWeight: '700', color: '#b91c1c' },

  // ALERT
  alertBoxTop:          { backgroundColor: '#fff', borderLeftWidth: 4, padding: 16, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: '#EBD6ED' },
  alertHeader:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertHeaderIcon:      { fontSize: 15 },
  alertHeaderTitle:     { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  alertText:            { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 8 },
  alertLink:            { fontSize: 13, fontWeight: '700' },

  // TIP
  tipCard:              { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  tipTag:               { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  tipText:              { fontSize: 13, lineHeight: 19, fontWeight: '500' },

  // BP
  bpCard:               { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1 },
  bpOk:                 { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  bpWarn:               { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bpDanger:             { backgroundColor: '#fff5f5', borderColor: '#fecaca' },
  bpIcon:               { fontSize: 18, marginTop: 1 },
  bpText:               { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },

  // DOCTOR
  doctorCard:           { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EBD6ED', padding: 16, marginBottom: 14 },
  doctorTag:            { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 12 },
  doctorRow:            { flexDirection: 'row', alignItems: 'center', gap: 14 },
  doctorAvatar:         { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  doctorAvatarText:     { fontSize: 16, fontWeight: '800' },
  doctorName:           { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  doctorFacility:       { fontSize: 12, color: '#6B7280' },
  doctorCode:           { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  // SPOTLIGHT
  spotlightCard:        { borderRadius: 16, padding: 18, marginBottom: 20 },
  spotlightTag:         { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 8 },
  spotlightTitle:       { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  spotlightRow:         { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  spotlightDot:         { fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },
  spotlightText:        { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, flex: 1 },

  // GRID
  sectionTitle:         { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 14 },
  grid:                 { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  gridCard:             { position: 'relative', width: '47.5%', backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EBD6ED', shadowColor: '#55075c', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  gridIconBg:           { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  gridIcon:             { fontSize: 20 },
  gridTitle:            { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  gridDesc:             { fontSize: 12, color: '#9CA3AF' },
  pingBadge:            { position: 'absolute', top: 10, right: 10, backgroundColor: '#c9227a', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, zIndex: 2 },
  pingBadgeText:        { color: '#fff', fontSize: 10, fontWeight: '800' },

  // EMPTY
  emptyStateTitle:      { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8, textAlign: 'center' },
  emptyStateText:       { fontSize: 14, color: '#6B7280', marginBottom: 20, textAlign: 'center', lineHeight: 20 },
  emptyStateButton:     { backgroundColor: '#55075c', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyStateButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyActionCard:      { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EBD6ED', padding: 14, marginBottom: 10 },
  emptyActionText:      { color: '#6B7280', fontSize: 13 },

  // SKELETON
  skeletonBase:         { backgroundColor: '#E9D5F5', borderRadius: 12, flex: 1 },
  skeletonStripRow:     { flexDirection: 'row', gap: 8, marginBottom: 14 },
  skeletonAvatar:       { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 12 },
});
