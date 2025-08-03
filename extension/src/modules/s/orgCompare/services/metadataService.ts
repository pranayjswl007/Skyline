/**
 * Metadata Service - Handles all metadata operations
 * Modular service layer for org compare functionality
 */

import { METADATA_TYPES } from '../metadataConfig';

export interface MetadataServiceResult {
  success: boolean;
  data?: any;
  error?: string;
  progress?: number;
}

export interface MetadataRetrievalOptions {
  orgAlias: string;
  metadataTypes?: string[];
  includeContent?: boolean;
  onProgress?: (progress: number, currentType: string) => void;
}

export class MetadataService {
  
  /**
   * Retrieve metadata from a Salesforce org
   */
  async retrieveOrgMetadata(options: MetadataRetrievalOptions): Promise<MetadataServiceResult> {
    try {
      const { orgAlias, metadataTypes = METADATA_TYPES.map(t => t.type), onProgress } = options;
      
      console.log(`Starting metadata retrieval from org: ${orgAlias}`);
      
      const allMetadata: any[] = [];
      const totalTypes = metadataTypes.length;
      
      for (let i = 0; i < metadataTypes.length; i++) {
        const metadataType = metadataTypes[i];
        const progress = Math.round((i / totalTypes) * 100);
        
        // Report progress
        if (onProgress) {
          onProgress(progress, metadataType);
        }
        
        try {
          const result = await this.executeCommand(`sf org list metadata --target-org ${orgAlias} --metadata-type ${metadataType} --json`);
          
          if (result.errorCode) {
            console.warn(`Failed to retrieve ${metadataType}:`, result.stderr);
            continue;
          }
          
          if (result.stdout) {
            const cleanOutput = this.stripAnsiCodes(result.stdout);
            const response = JSON.parse(cleanOutput);
            const metadataItems = this.parseMetadataListResponse(response.result || [], metadataType);
            allMetadata.push(...metadataItems);
            
            console.log(`Retrieved ${metadataItems.length} ${metadataType} items`);
          }
        } catch (error) {
          console.warn(`Error retrieving ${metadataType}:`, error);
        }
      }
      
      // Report completion
      if (onProgress) {
        onProgress(100, 'Complete');
      }
      
      console.log(`Total metadata items retrieved from ${orgAlias}:`, allMetadata.length);
      
      return {
        success: true,
        data: allMetadata
      };
      
    } catch (error) {
      console.error('Metadata retrieval failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Retrieve metadata content for specific items
   */
  async retrieveMetadataContent(orgAlias: string, metadataType: string, metadataName: string): Promise<MetadataServiceResult> {
    try {
      console.log(`Retrieving content for ${metadataType}:${metadataName} from ${orgAlias}`);
      
      const result = await this.executeCommand(
        `sf project retrieve start --target-org ${orgAlias} --metadata ${metadataType}:${metadataName} --json`
      );
      
      if (result.errorCode) {
        console.warn(`Failed to retrieve content for ${metadataType}:${metadataName}:`, result.stderr);
        return {
          success: false,
          error: result.stderr || 'Failed to retrieve content'
        };
      }
      
      if (result.stdout) {
        const cleanOutput = this.stripAnsiCodes(result.stdout);
        const response = JSON.parse(cleanOutput);
        
        if (response.status === 0 && response.result && response.result.files) {
          const filePath = response.result.files[0];
          const contentResult = await this.executeCommand(`cat "${filePath}"`);
          
          if (!contentResult.errorCode && contentResult.stdout) {
            return {
              success: true,
              data: contentResult.stdout
            };
          }
        }
      }
      
      return {
        success: false,
        error: 'Content not available'
      };
      
    } catch (error) {
      console.error(`Error retrieving content for ${metadataType}:${metadataName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Compare metadata between source and target
   */
  compareMetadata(source: any[], target: any[]): any {
    console.log('Starting metadata comparison...');
    console.log('Source items:', source.length);
    console.log('Target items:', target.length);
    
    const added: any[] = [];
    const removed: any[] = [];
    const changed: any[] = [];
    const unchanged: any[] = [];
    
    // Create maps for efficient lookup
    const sourceMap = new Map<string, any>();
    const targetMap = new Map<string, any>();
    
    source.forEach(item => sourceMap.set(item.fullName, item));
    target.forEach(item => targetMap.set(item.fullName, item));
    
    // Find added items (in source but not in target)
    source.forEach(item => {
      if (!targetMap.has(item.fullName)) {
        item.status = 'added';
        item.statusBadgeClass = 'status-badge-added';
        added.push(item);
      }
    });
    
    // Find removed items (in target but not in source)
    target.forEach(item => {
      if (!sourceMap.has(item.fullName)) {
        item.status = 'removed';
        item.statusBadgeClass = 'status-badge-removed';
        removed.push(item);
      }
    });
    
    // Find changed and unchanged items (in both source and target)
    source.forEach(sourceItem => {
      const targetItem = targetMap.get(sourceItem.fullName);
      if (targetItem) {
        if (this.hasChanges(sourceItem, targetItem)) {
          sourceItem.status = 'changed';
          sourceItem.statusBadgeClass = 'status-badge-changed';
          changed.push(sourceItem);
        } else {
          sourceItem.status = 'unchanged';
          sourceItem.statusBadgeClass = 'status-badge-unchanged';
          unchanged.push(sourceItem);
        }
      }
    });
    
    console.log('Comparison results:', {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length
    });
    
    return { added, removed, changed, unchanged };
  }
  
  /**
   * Create deployment package
   */
  async createDeploymentPackage(items: any[]): Promise<MetadataServiceResult> {
    try {
      console.log('Creating deployment package...');
      
      const packageXml = this.generatePackageXml(items);
      const packageDir = './deployment-package';
      
      // Create package directory
      await this.executeCommand(`mkdir -p ${packageDir}`);
      
      // Write package.xml
      await this.executeCommand(`echo '${packageXml}' > ${packageDir}/package.xml`);
      
      // Create metadata directory structure and copy files
      for (const item of items) {
        const metadataDir = `${packageDir}/force-app/main/default/${this.getMetadataDirectory(item.type)}`;
        await this.executeCommand(`mkdir -p ${metadataDir}`);
        
        // Create the metadata file
        const fileName = this.getMetadataFileName(item.type, item.name);
        const filePath = `${metadataDir}/${fileName}`;
        
        if (item.sourceValue) {
          await this.executeCommand(`echo '${item.sourceValue}' > "${filePath}"`);
        }
      }
      
      // Create zip file
      await this.executeCommand(`cd ${packageDir} && zip -r ../deployment-package.zip .`);
      
      console.log('Package created successfully!');
      
      return {
        success: true,
        data: {
          packageXml,
          items: items.map(item => `${item.type}:${item.name}`)
        }
      };
      
    } catch (error) {
      console.error('Failed to create package:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  // Private helper methods
  private async executeCommand(command: string): Promise<any> {
    // This would be implemented to execute shell commands
    // For now, return a mock implementation
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          errorCode: 0,
          stdout: 'Mock command output',
          stderr: ''
        });
      }, 100);
    });
  }
  
  private stripAnsiCodes(text?: string): string {
    if (!text) return '';
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
  
  private parseMetadataListResponse(result: any[], metadataType: string): any[] {
    return result.map(item => ({
      type: metadataType,
      name: item.fullName || item.name,
      fullName: `${metadataType}/${item.fullName || item.name}`,
      lastModifiedDate: item.lastModifiedDate || new Date().toISOString(),
      lastModifiedBy: item.lastModifiedBy || 'Unknown',
      sourceValue: '',
      targetValue: '',
      selected: false
    }));
  }
  
  private hasChanges(sourceItem: any, targetItem: any): boolean {
    // Simple comparison - in real implementation, this would compare actual content
    return sourceItem.lastModifiedDate !== targetItem.lastModifiedDate;
  }
  
  private generatePackageXml(items: any[]): string {
    const metadataTypes = new Map<string, string[]>();
    
    items.forEach(item => {
      if (!metadataTypes.has(item.type)) {
        metadataTypes.set(item.type, []);
      }
      metadataTypes.get(item.type)!.push(item.name);
    });
    
    let packageXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    packageXml += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
    
    metadataTypes.forEach((names, type) => {
      packageXml += `  <types>\n`;
      names.forEach(name => {
        packageXml += `    <members>${name}</members>\n`;
      });
      packageXml += `    <name>${type}</name>\n`;
      packageXml += `  </types>\n`;
    });
    
    packageXml += '  <version>58.0</version>\n';
    packageXml += '</Package>';
    
    return packageXml;
  }
  
  private getMetadataDirectory(metadataType: string): string {
    const directoryMap: { [key: string]: string } = {
      'ApexClass': 'classes',
      'ApexTrigger': 'triggers',
      'CustomObject': 'objects',
      'CustomField': 'objects',
      'Layout': 'layouts',
      'PermissionSet': 'permissionsets',
      'Profile': 'profiles',
      'LightningComponentBundle': 'lwc',
      'AuraDefinitionBundle': 'aura',
      'StaticResource': 'staticresources',
      'EmailTemplate': 'email',
      'Document': 'documents',
      'Tab': 'tabs',
      'App': 'applications',
      'Workflow': 'workflows',
      'ValidationRule': 'objects',
      'SharingRule': 'sharingRules',
      'Queue': 'queues',
      'Group': 'groups',
      'Role': 'roles',
      'CustomPermission': 'customPermissions',
      'Flow': 'flows',
      'ProcessBuilder': 'processes',
      'QuickAction': 'quickActions',
      'Letterhead': 'letterhead',
      'Wave': 'wave',
      'Dashboard': 'dashboards',
      'Report': 'reports',
      'ReportType': 'reportTypes'
    };
    
    return directoryMap[metadataType] || 'classes';
  }
  
  private getMetadataFileName(metadataType: string, metadataName: string): string {
    const extensionMap: { [key: string]: string } = {
      'ApexClass': '.cls',
      'ApexTrigger': '.trigger',
      'CustomObject': '.object-meta.xml',
      'CustomField': '.field-meta.xml',
      'Layout': '.layout-meta.xml',
      'PermissionSet': '.permissionset-meta.xml',
      'Profile': '.profile-meta.xml',
      'LightningComponentBundle': '',
      'AuraDefinitionBundle': '',
      'StaticResource': '.resource-meta.xml',
      'EmailTemplate': '.email-meta.xml',
      'Document': '.document-meta.xml',
      'Tab': '.tab-meta.xml',
      'App': '.app-meta.xml',
      'Workflow': '.workflow-meta.xml',
      'ValidationRule': '.validationRule-meta.xml',
      'SharingRule': '.sharingRules-meta.xml',
      'Queue': '.queue-meta.xml',
      'Group': '.group-meta.xml',
      'Role': '.role-meta.xml',
      'CustomPermission': '.customPermission-meta.xml',
      'Flow': '.flow-meta.xml',
      'ProcessBuilder': '.process-meta.xml',
      'QuickAction': '.quickAction-meta.xml',
      'Letterhead': '.letter-meta.xml',
      'Wave': '.wave-meta.xml',
      'Dashboard': '.dashboard-meta.xml',
      'Report': '.report-meta.xml',
      'ReportType': '.reportType-meta.xml'
    };
    
    const extension = extensionMap[metadataType] || '';
    return `${metadataName}${extension}`;
  }
} 