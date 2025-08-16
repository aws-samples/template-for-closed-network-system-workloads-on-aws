interface Parameter {
  deployEnv: string;
  sharedVpcCidr: string;
  appVpcCidr: string;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  notifyEmail: string;
}

const devParameter: Parameter = {
  deployEnv: "dev",
  sharedVpcCidr: '10.0.0.0/16',
  appVpcCidr: '10.1.0.0/16',
  windowsBastion: false,
  linuxBastion: false,
  domainName: "templateapp.local",
  notifyEmail: "johndoe+notify@example.com"
}

const parameter = devParameter;
export default parameter;