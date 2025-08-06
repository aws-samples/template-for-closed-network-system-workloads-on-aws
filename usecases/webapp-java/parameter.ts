interface Parameter {
  deployEnv: string;
  accessViaPrivateLink: boolean;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  notifyEmail: string;
}

const devParameter: Parameter = {
  deployEnv: "dev",
  accessViaPrivateLink: false,
  windowsBastion: false,
  linuxBastion: false,
  domainName: "templateapp.local",
  notifyEmail: "johndoe+notify@example.com"
}

const parameter = devParameter;
export default parameter;