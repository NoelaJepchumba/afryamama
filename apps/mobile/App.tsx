import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';

// Import screens
import LoginScreen from './screens/LoginScreen';
import MotherDashboardScreen from './screens/MotherDashboardScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import RecordsScreen from './screens/RecordsScreen';
import ImmunizationScreen from './screens/ImmunizationScreen';
import WellnessTipsScreen from './screens/WellnessTipsScreen';
import ProfileScreen from './screens/ProfileScreen';
import MotherProfileSetupScreen from './screens/MotherProfileSetupScreen';
import MilestonesScreen from './screens/MilestonesScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import GrowthMonitoringScreen from './screens/GrowthMonitoringScreen';
import { firebaseAuth } from './lib/firebaseClient';
import {
  loadMotherProfile,
  loginWithFirebase,
  logoutFromFirebase,
  signUpMotherWithFirebase,
} from './lib/firebaseAuth';
import { saveMotherProfile } from './lib/motherProfileStore';

type Screen =
  | 'LOGIN'
  | 'DASHBOARD'
  | 'APPOINTMENTS'
  | 'RECORDS'
  | 'IMMUNIZATION'
  | 'WELLNESS'
  | 'PROFILE_SETUP'
  | 'PROFILE'
  | 'MILESTONES'
  | 'NOTIFICATIONS'
  | 'GROWTH';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('LOGIN');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [pregnancyWeek, setPregnancyWeek] = useState<number | null>(null);
  const [nextAppointmentText, setNextAppointmentText] = useState<string | null>(null);
  const redirectToProfileAfterSignUpRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setUserName('');
        setUserEmail('');
        setPregnancyWeek(null);
        setNextAppointmentText(null);
        setCurrentScreen('LOGIN');
        return;
      }

      const profile = await loadMotherProfile(user);
      setUserName(profile.displayName);
      setUserEmail(user.email || '');
      setPregnancyWeek(profile.pregnancyWeek);
      setNextAppointmentText(profile.nextAppointmentText);

      if (redirectToProfileAfterSignUpRef.current) {
        redirectToProfileAfterSignUpRef.current = false;
        setCurrentScreen('PROFILE_SETUP');
        return;
      }

      setCurrentScreen('DASHBOARD');
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = async (email: string, password: string) => {
    await loginWithFirebase(email, password);
  };

  const handleSignUpSuccess = async (fullName: string, email: string, password: string) => {
    redirectToProfileAfterSignUpRef.current = true;
    try {
      await signUpMotherWithFirebase(fullName, email, password);
    } catch (error) {
      redirectToProfileAfterSignUpRef.current = false;
      throw error;
    }
  };

  const handleLogout = async () => {
    await logoutFromFirebase();
    setUserName('');
    setUserEmail('');
    setPregnancyWeek(null);
    setNextAppointmentText(null);
    setCurrentScreen('LOGIN');
  };

  const handleCompleteProfileSetup = async (profile: Parameters<typeof saveMotherProfile>[0]) => {
    await saveMotherProfile(profile);
    setCurrentScreen('DASHBOARD');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'LOGIN':
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onSignUpSuccess={handleSignUpSuccess}
          />
        );
      case 'DASHBOARD':
        return (
          <MotherDashboardScreen
            userEmail={userEmail}
            userName={userName}
            pregnancyWeek={pregnancyWeek}
            nextAppointmentText={nextAppointmentText}
            onNavigate={(screen) => setCurrentScreen(screen as Screen)}
            onLogout={handleLogout}
          />
        );
      case 'PROFILE_SETUP':
        return (
          <MotherProfileSetupScreen
            email={userEmail}
            onBackToLogin={handleLogout}
            onComplete={handleCompleteProfileSetup}
          />
        );
      case 'PROFILE':
        return <ProfileScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'MILESTONES':
        return <MilestonesScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'APPOINTMENTS':
        return <AppointmentsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'RECORDS':
        return <RecordsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'IMMUNIZATION':
        return <ImmunizationScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'WELLNESS':
        return <WellnessTipsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'NOTIFICATIONS':
        return <NotificationsScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      case 'GROWTH':
        return <GrowthMonitoringScreen email={userEmail} onBack={() => setCurrentScreen('DASHBOARD')} />;
      default:
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onSignUpSuccess={handleSignUpSuccess}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.wrapper}>{renderScreen()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef3f9',
  },
  wrapper: {
    flex: 1,
  },
});
