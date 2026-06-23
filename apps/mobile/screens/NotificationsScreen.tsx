import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchNotifications, type MobileNotification } from '../lib/firestoreData';

interface NotificationsScreenProps {
  email: string;
  onBack: () => void;
}

export default function NotificationsScreen({ email, onBack }: NotificationsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MobileNotification[]>([]);

  useEffect(() => {
    async function loadNotifications() {
      try {
        if (!email) {
          setItems([]);
          return;
        }

        const rows = await fetchNotifications(email.toLowerCase());
        setItems(rows);
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, [email]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.emptyText}>Loading notifications...</Text> : null}

        {!loading && items.length === 0 ? (
          <Text style={styles.emptyText}>No notifications found in Firestore.</Text>
        ) : null}

        {items.map((item) => (
          <View style={styles.card} key={item.id}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={item.read ? styles.readTag : styles.unreadTag}>{item.read ? 'READ' : 'NEW'}</Text>
            </View>
            <Text style={styles.cardDate}>{item.date} • {item.type}</Text>
            <Text style={styles.cardMessage}>{item.message}</Text>
          </View>
        ))}
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
    color: '#f59e0b',
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
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#121826',
    borderColor: '#243049',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  unreadTag: {
    color: '#0f172a',
    backgroundColor: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  readTag: {
    color: '#0f172a',
    backgroundColor: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  cardDate: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  cardMessage: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
});
