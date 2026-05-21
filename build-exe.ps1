$source = @"
using System;
using System.Diagnostics;
using System.IO;

class Program {
    static void Main() {
        string dir = Path.GetDirectoryName(
            System.Reflection.Assembly.GetExecutingAssembly().Location);
        string bat = Path.Combine(dir, "RocketAnnouncer.bat");

        if (!File.Exists(bat)) {
            Console.WriteLine("RocketAnnouncer.bat not found in " + dir);
            Console.ReadKey();
            return;
        }

        var psi = new ProcessStartInfo();
        psi.FileName = "cmd.exe";
        psi.Arguments = "/c \"" + bat + "\"";
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = true;
        Process.Start(psi);
    }
}
"@

$outPath = Join-Path $PSScriptRoot "RocketAnnouncer.exe"
Add-Type -TypeDefinition $source -OutputAssembly $outPath -OutputType ConsoleApplication
Write-Host "Created: $outPath"
