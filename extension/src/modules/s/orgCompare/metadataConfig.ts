// Metadata config for Org Compare

export interface MetadataTypeConfig {
  type: string;
  displayName: string;
  icon?: string;
  autoWire?: 'lwcFolder' | 'apexMeta' | 'objectFields' | 'objectLayouts' | 'fieldParentObject' | null;
}

export const METADATA_TYPES: MetadataTypeConfig[] = [
  { type: 'ApexClass', displayName: 'Apex Class', icon: 'utility:code', autoWire: 'apexMeta' },
  { type: 'ApexTrigger', displayName: 'Apex Trigger', icon: 'utility:code', autoWire: 'apexMeta' },
  { type: 'ApexPage', displayName: 'Visualforce Page', icon: 'utility:page', autoWire: 'apexMeta' },
  { type: 'ApexComponent', displayName: 'Apex Component', icon: 'utility:component', autoWire: 'apexMeta' },
  { type: 'CustomObject', displayName: 'Custom Object', icon: 'standard:custom_object', autoWire: 'objectFields' },
  { type: 'CustomField', displayName: 'Custom Field', icon: 'standard:custom_object', autoWire: 'fieldParentObject' },
  { type: 'Layout', displayName: 'Layout', icon: 'utility:layout', autoWire: 'objectLayouts' },
  { type: 'LightningComponentBundle', displayName: 'LWC', icon: 'utility:lightning', autoWire: 'lwcFolder' },
  { type: 'Profile', displayName: 'Profile', icon: 'standard:profile', autoWire: null },
  { type: 'PermissionSet', displayName: 'Permission Set', icon: 'standard:avatar', autoWire: null },
  // Add more types as needed
];

// Helper for easy lookup
export const METADATA_TYPE_SET = new Set(METADATA_TYPES.map(t => t.type)); 