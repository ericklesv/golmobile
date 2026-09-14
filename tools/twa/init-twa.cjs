/**
 * Gera o projeto TWA (app Android da Play Store) do JogaGol SEM as perguntas interativas do
 * `bubblewrap init` — mesmas chamadas da biblioteca @bubblewrap/core, com as respostas da
 * docs/PLAY_STORE.md fixas aqui. Depois rode `bubblewrap build` na pasta gerada.
 *
 * Uso (qualquer pasta):  node tools/twa/init-twa.cjs [pasta-destino]
 *   padrão: C:\Users\<você>\dev\jogagol-twa (FORA do repo: a chave de upload fica lá)
 * Pré-requisitos: `npm i -g @bubblewrap/cli` e ~/.bubblewrap/config.json com jdkPath/androidSdkPath
 * (JDK 17 e Android SDK com build-tools 36.1.0 — ver docs/PLAY_STORE.md, passo 4).
 * Senhas da chave: env BUBBLEWRAP_KEYSTORE_PASSWORD e BUBBLEWRAP_KEY_PASSWORD (as mesmas que o
 * `bubblewrap build` lê); sem elas, gera uma senha forte e grava em SENHA-DA-CHAVE.txt na pasta.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const globalRoot = execSync('npm root -g').toString().trim();
const core = require(path.join(globalRoot, '@bubblewrap/cli/node_modules/@bubblewrap/core'));
const { TwaManifest, TwaGenerator, ConsoleLog, BufferedLog, JdkHelper, KeyTool, Config } = core;

const MANIFEST_URL = 'https://jogagol.com.br/manifest.webmanifest';
const TARGET = path.resolve(process.argv[2] || path.join(os.homedir(), 'dev', 'jogagol-twa'));
const CONFIG_PATH = path.join(os.homedir(), '.bubblewrap', 'config.json');

async function main() {
  const config = await Config.loadConfig(CONFIG_PATH);
  if (!config) throw new Error(`Sem ${CONFIG_PATH} (jdkPath/androidSdkPath).`);
  fs.mkdirSync(TARGET, { recursive: true });

  const m = await TwaManifest.fromWebManifest(MANIFEST_URL);
  // ── respostas do "bubblewrap init" (docs/PLAY_STORE.md) ──
  m.packageId = 'br.com.jogagol.app';
  m.host = 'jogagol.com.br';
  m.name = 'JogaGol';
  m.launcherName = 'JogaGol';
  m.startUrl = '/?src=twa'; // liga o modo app (web/src/lib/twa.ts); o manifest do site segue com "/"
  m.display = 'standalone';
  m.orientation = 'portrait';
  m.iconUrl = 'https://jogagol.com.br/icon-512.png';
  m.maskableIconUrl = 'https://jogagol.com.br/icon-512-maskable.png';
  m.appVersionCode = 1;
  m.appVersionName = '1.0.0';
  m.enableNotifications = true; // o Bubblewrap exige junto com o Play Billing (delegação de notificações)
  m.features = { ...m.features, playBilling: { enabled: true } }; // Google Play Billing (Digital Goods API)
  m.minSdkVersion = 23; // a biblioteca de billing exige Android 6.0+ (o padrão do Bubblewrap é 21)
  m.signingKey = { path: path.join(TARGET, 'android.keystore'), alias: 'jogagol' };
  m.generatorApp = 'bubblewrap-cli';

  await m.saveToFile(path.join(TARGET, 'twa-manifest.json'));
  const log = new BufferedLog(new ConsoleLog('twa'));
  await new TwaGenerator().createTwaProject(TARGET, m, log, () => {});
  log.flush();
  // manifest-checksum.txt: sem ele o `bubblewrap build` pergunta se deve atualizar o projeto
  const sum = crypto.createHash('sha1').update(fs.readFileSync(path.join(TARGET, 'twa-manifest.json'))).digest('hex');
  fs.writeFileSync(path.join(TARGET, 'manifest-checksum.txt'), sum);

  // ── chave de upload (Play App Signing guarda a chave do app; esta assina o que sobe) ──
  if (!fs.existsSync(m.signingKey.path)) {
    const pass = process.env.BUBBLEWRAP_KEYSTORE_PASSWORD || crypto.randomBytes(18).toString('base64url');
    const keyPass = process.env.BUBBLEWRAP_KEY_PASSWORD || pass;
    const keytool = new KeyTool(new JdkHelper(process, config));
    await keytool.createSigningKey({
      fullName: 'JogaGol', organizationalUnit: 'Managol Softwares', organization: 'Managol Softwares', country: 'BR',
      password: pass, keypassword: keyPass, alias: m.signingKey.alias, path: m.signingKey.path,
    });
    if (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD) {
      fs.writeFileSync(path.join(TARGET, 'SENHA-DA-CHAVE.txt'),
        `Chave de upload do JogaGol (Google Play)\narquivo: ${m.signingKey.path}\nalias: ${m.signingKey.alias}\nsenha do keystore: ${pass}\nsenha da chave: ${keyPass}\n\nGUARDE NUM GERENCIADOR DE SENHAS e apague este arquivo. Sem a chave e a senha não há como atualizar o app.\n`);
    }
  }
  console.log(`\nProjeto TWA em ${TARGET}\nAgora: cd "${TARGET}" && bubblewrap build`);
}

main().catch((e) => { console.error(e); process.exit(1); });
