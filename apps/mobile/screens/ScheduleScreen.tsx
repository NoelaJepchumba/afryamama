import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchAppointments, type MobileAppointment } from '../lib/firestoreData';

interface ScheduleScreenProps {
  email: string;
  onBack: () => void;
}

export default function ScheduleScreen({ email, onBack }: ScheduleScreenProps) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<MobileAppointment[]>([]);

  useEffect(() => {
    async function loadSchedule() {
      try {
        if (!email) {
          setAppointments([]);
          return;
        }

        const rows = await fetchAppointments(email.toLowerCase());
        setAppointments(rows);
      } finally {
        setLoading(false);
      }
    }

    loadSchedule();
  }, [email]);

  const grouped = useMemo(() => {
    const upcoming = appointments.filter((item) => item.status !== 'COMPLETED');
    const completed = appointments.filter((item) => item.status === 'COMPLETED');
    return { upcoming, completed };
  }, [appointments]);

  function renderItems(rows: MobileAppointment[]) {
    if (rows.length === 0) {
      return <Text style={styles.emptyText}>No schedule items found.</Text>;
    }

    return rows.map((item) => (
      <View style={styles.card} key={item.id}>
        <Text style={styles.cardTitle}>{item.reason}</Text>
        <Text style={styles.cardMeta}>{item.date} • {item.time}</Text>
        <Text style={styles.cardMeta}>Provider: {item.doctor}</Text>
      </View>
    ));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Schedule</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.emptyText}>Loading schedule...</Text> : null}

        {!loading ? (
          <>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {renderItems(grouped.upcoming)}

            <Text style={styles.sectionTitle}>Completed</Text>
            {renderItems(grouped.completed)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#243049',
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnText: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 24,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#121826',
    borderColor: '#243049',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 2,
  },
});
