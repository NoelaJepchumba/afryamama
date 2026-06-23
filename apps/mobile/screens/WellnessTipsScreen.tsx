import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { fetchWellnessTips, type MobileTip } from '../lib/firestoreData';

interface WellnessTipsProps {
  email: string;
  onBack: () => void;
}

export default function WellnessTipsScreen({ email, onBack }: WellnessTipsProps) {
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState<MobileTip[]>([]);

  useEffect(() => {
    async function loadTips() {
      try {
        if (!email) {
          setTips([]);
          return;
        }

        const rows = await fetchWellnessTips(email.toLowerCase());
        setTips(rows);
      } finally {
        setLoading(false);
      }
    }

    loadTips();
  }, [email]);

  function cardStyles(index: number) {
    const themes = [
      { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.2)', tagColor: '#8b5cf6' },
      { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.2)', tagColor: '#ec4899' },
      { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', tagColor: '#10b981' },
      { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)', tagColor: '#f59e0b' },
    ];
    return themes[index % themes.length];
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wellness Center</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Daily Guidance Cards</Text>

        {loading ? <Text style={styles.emptyText}>Loading wellness tips...</Text> : null}

        {!loading && tips.length === 0 ? (
          <Text style={styles.emptyText}>No wellness tips found in Firestore.</Text>
        ) : null}

        {tips.map((tip, index) => {
          const theme = cardStyles(index);
          return (
          <View style={[styles.tipCard, { backgroundColor: theme.bg, borderColor: theme.border }]} key={tip.id}>
            <Text style={[styles.tipCategory, { color: theme.tagColor }]}>{tip.category}</Text>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipContent}>{tip.content}</Text>
            
            <TouchableOpacity style={styles.readMoreBtn}>
              <Text style={[styles.readMoreText, { color: theme.tagColor }]}>Read full article →</Text>
            </TouchableOpacity>
          </View>
        );})}
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
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  tipCategory: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tipTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  tipContent: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  readMoreBtn: {
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
