import React, { useState, useContext, useCallback, useMemo } from 'react';
import { I18nManager, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { createHmac } from 'crypto';
import secp256k1 from 'secp256k1';

import { BlueButton, BlueCard, BlueLoading, BlueSpacing20, BlueSpacing40, BlueText, SafeBlueArea } from '../../BlueComponents';

import navigationStyle from '../../components/navigationStyle';
import Lnurl from '../../class/lnurl';
import { Chain } from '../../models/bitcoinUnits';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import url from 'url';

const AuthState = {
  USER_PROMPT: 0,
  IN_PROGRESS: 1,
  SUCCESS: 2,
  ERROR: 3,
};

const LnurlAuth = () => {
  const { wallets } = useContext(BlueStorageContext);
  const { walletID, lnurl } = useRoute().params;
  const wallet = useMemo(() => wallets.find(w => w.getID() === walletID), [wallets, walletID]);
  const lnurlObj = useMemo(
    () => (lnurl ? url.parse(Lnurl.getUrlFromLnurl(lnurl), true) : {}), // eslint-disable-line node/no-deprecated-api
    [lnurl],
  );
  const [authState, setAuthState] = useState(AuthState.USER_PROMPT);
  const [errMsg, setErrMsg] = useState('');
  const { setParams, pop, navigate } = useNavigation();
  const { colors } = useTheme();
  const stylesHook = StyleSheet.create({
    root: {
      backgroundColor: colors.background,
    },
    walletWrapLabel: {
      color: colors.buttonAlternativeTextColor,
    },
  });

  const authenticate = useCallback(() => {
    const hmac = createHmac('sha256', wallet.secret);

    hmac.on('readable', async () => {
      try {
        setAuthState(AuthState.IN_PROGRESS);

        const privateKey = hmac.read();
        const privateKeyBuf = Buffer.from(privateKey, 'hex');
        const publicKey = secp256k1.publicKeyCreate(privateKeyBuf);
        const signatureObj = secp256k1.sign(Buffer.from(lnurlObj.query.k1, 'hex'), privateKeyBuf);
        const derSignature = secp256k1.signatureExport(signatureObj.signature);

        const response = await fetch(`${lnurlObj.href}&sig=${derSignature.toString('hex')}&key=${publicKey.toString('hex')}`);
        const res = await response.json();

        if (res.status === 'OK') {
          setAuthState(AuthState.SUCCESS);
          setErrMsg('');
        } else {
          setAuthState(AuthState.ERROR);
          setErrMsg(res.reason);
        }
      } catch (err) {
        setAuthState(AuthState.ERROR);
        setErrMsg(err);
      }
    });

    /* 
        The spec requires that we generate a private key for each login domain.
        We use hmac_sha256(wallet.secret, domain)
        This should stay consistent among wallet versions, else the user will loose account access.
    */
    hmac.write(lnurlObj.hostname);
    hmac.end();
  }, [wallet, lnurlObj]);

  const onWalletSelect = wallet => {
    setParams({ walletID: wallet.getID() });
    pop();
  };

  if (!lnurlObj || !wallet || authState === AuthState.IN_PROGRESS)
    return (
      <View style={[styles.root, stylesHook.root]}>
        <BlueLoading />
      </View>
    );

  const renderWalletSelectionButton = authState === AuthState.USER_PROMPT && (
    <View style={styles.walletSelectRoot}>
      {authState !== AuthState.IN_PROGRESS && (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.walletSelectTouch}
          onPress={() => navigate('SelectWallet', { onWalletSelect, chainType: Chain.OFFCHAIN })}
        >
          <Text style={styles.walletSelectText}>{loc.wallets.select_wallet.toLowerCase()}</Text>
          <Icon name={I18nManager.isRTL ? 'angle-left' : 'angle-right'} size={18} type="font-awesome" color="#9aa0aa" />
        </TouchableOpacity>
      )}
      <View style={styles.walletWrap}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.walletWrapTouch}
          onPress={() => navigate('SelectWallet', { onWalletSelect, chainType: Chain.OFFCHAIN })}
        >
          <Text style={[styles.walletWrapLabel, stylesHook.walletWrapLabel]}>{wallet.getLabel()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeBlueArea style={styles.root}>
      {authState === AuthState.USER_PROMPT && (
        <>
          <ScrollView>
            <BlueCard>
              <BlueText style={styles.alignSelfCenter}>{loc.lnurl_auth.prompt[lnurlObj.query.action || 'auth'].q}</BlueText>
              <BlueText style={styles.domainName}>{lnurlObj.hostname}</BlueText>
              <BlueText style={styles.alignSelfCenter}>{loc.lnurl_auth.prompt[lnurlObj.query.action || 'auth'].w}</BlueText>
              <BlueSpacing40 />
              <BlueButton title={loc.lnurl_auth.authenticate} onPress={authenticate} />
              <BlueSpacing40 />
            </BlueCard>
          </ScrollView>
          {renderWalletSelectionButton}
        </>
      )}

      {authState === AuthState.SUCCESS && (
        <BlueCard>
          <View style={styles.iconContainer}>
            <LottieView style={styles.icon} source={require('../../img/bluenice.json')} autoPlay loop={false} />
          </View>
          <BlueSpacing20 />
          <BlueText style={styles.alignSelfCenter}>
            {loc.formatString(loc.lnurl_auth.prompt[lnurlObj.query.action || 'auth'].s, { hostname: lnurlObj.hostname })}
          </BlueText>
          <BlueSpacing20 />
        </BlueCard>
      )}

      {authState === AuthState.ERROR && (
        <BlueCard>
          <BlueSpacing20 />
          <BlueText style={styles.alignSelfCenter}>
            {loc.formatString(loc.lnurl_auth.could_not_auth, { hostname: lnurlObj.hostname })}
          </BlueText>
          <BlueText style={styles.alignSelfCenter}>{loc.formatString(loc.lnurl_auth.response, { errMsg: errMsg })}</BlueText>
          <BlueSpacing20 />
        </BlueCard>
      )}
    </SafeBlueArea>
  );
};

export default LnurlAuth;

const styles = StyleSheet.create({
  alignSelfCenter: {
    alignSelf: 'center',
  },
  domainName: {
    alignSelf: 'center',
    fontWeight: 'bold',
    fontSize: 25,
    paddingVertical: 10,
  },
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  iconContainer: {
    backgroundColor: '#ccddf9',
    width: 120,
    height: 120,
    maxWidth: 120,
    maxHeight: 120,
    padding: 0,
    borderRadius: 60,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 400,
    height: 400,
  },
  walletSelectRoot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  walletSelectTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletSelectText: {
    color: '#9aa0aa',
    fontSize: 14,
    marginRight: 8,
  },
  walletWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  walletWrapTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletWrapLabel: {
    fontSize: 14,
  },
});

LnurlAuth.navigationOptions = navigationStyle({
  title: '',
  closeButton: true,
  closeButtonFunc: ({ navigation }) => navigation.dangerouslyGetParent().popToTop(),
});