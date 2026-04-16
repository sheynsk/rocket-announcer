// Generates RocketAnnouncer.exe — a tiny launcher that runs start.bat
// Uses Windows built-in iexpress tool (available on all Windows 10/11)

import { writeFileSync, execSync } from 'child_process';
import { writeFileSync as wfs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sedPath = join(__dirname, '_build.sed');
const exePath = join(__dirname, 'RocketAnnouncer.exe');
const batPath = join(__dirname, 'start.bat');

const sed = `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=${exePath}
FriendlyName=Rocket Announcer
AppLaunched=start.bat
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0="start.bat"
[SourceFiles]
SourceFiles0=${__dirname}\\
[SourceFiles0]
%FILE0%=
`;

wfs(sedPath, sed);

try {
  execSync(`iexpress /N /Q "${sedPath}"`, { stdio: 'inherit' });
  console.log(`\n  OK: ${exePath}\n`);
} catch (e) {
  console.error('iexpress failed:', e.message);
  process.exit(1);
}
