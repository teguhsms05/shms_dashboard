module.exports = {
  apps: [
    {
      name: "tunnel-2235-ssh",
      // Gunakan 'ssh' saja jika autossh tidak terinstal di PATH
      script: "ssh", 
      windowsHide: true,
      // Gunakan format ARRAY untuk args agar tidak salah interpretasi host
      args: [
        "-N",
        "-o", "ServerAliveInterval=10",
        "-o", "ServerAliveCountMax=3",
        "-o", "ExitOnForwardFailure=yes",
        "-o", "StrictHostKeyChecking=no",
        // Format -R: [remote_port]:[local_host]:[local_port]
        "-R", "2236:192.168.68.55:5005",
        "-i", "C:\\Users\\teguh\\.ssh\\id_ed25519",
        "ubs@ts.monitoringsystems.co.id -p 2236"
      ],
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        "AUTOSSH_GATETIME": "0"
      }
    }
  ]
}