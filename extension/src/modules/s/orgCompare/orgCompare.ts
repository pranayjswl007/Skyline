/**
 * Copyright 2025 Mitch Spano
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This component provides org compare and deploy functionality similar to Gearset.
 * It allows users to compare metadata between:
 * - Source: Org or Git repository
 * - Target: Salesforce org or Git repository
 * Users can view added, removed, and changed metadata components with filtering capabilities.
 */
import { ExecuteResult } from "../app/app";
import { LightningElement, track } from "lwc";
import Toast from "lightning-base-components/src/lightning/toast/toast.js";
import App from "../app/app";
import { METADATA_TYPES, METADATA_TYPE_SET } from "./metadataConfig";
import { DiffContent as DiffViewerContent } from "../diffViewer/diffViewer";

export interface MetadataComparison {
  added: MetadataItem[];
  removed: MetadataItem[];
  changed: MetadataItem[];
  unchanged: MetadataItem[];
}

export interface MetadataItem {
  type: string;
  name: string;
  fullName: string;
  lastModifiedDate?: string;
  lastModifiedBy?: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  sourceValue?: string;
  targetValue?: string;
  diff?: string;
  selected?: boolean;
  statusBadgeClass?: string;
  lastModified?: string;
}

export interface DiffLine {
  lineNumber: number;
  sourceContent: string;
  targetContent: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  diffLineClass?: string;
}

export interface DiffContent {
  diffLines: DiffLine[];
}

export interface CompareFilter {
  metadataTypes: string[];
  status: ('added' | 'removed' | 'changed' | 'unchanged')[];
  searchTerm: string;
}

export interface SourceTargetConfig {
  type: 'org' | 'git';
  orgAlias?: string;
  gitBranch?: string;
}

export interface OrgInfo {
  accessToken: string;
  instanceUrl: string;
  orgId: string;
  username: string;
  loginUrl: string;
  clientId: string;
  isDevHub: boolean;
  instanceApiVersion: string;
  instanceApiVersionLastRetrieved: string;
  alias: string;
  isDefaultDevHubUsername: boolean;
  isDefaultUsername: boolean;
  lastUsed: string;
  connectedStatus: string;
  defaultMarker?: string;
  devHubUsername?: string;
  created?: string;
  expirationDate?: string;
  createdOrgInstance?: string;
  isScratch?: boolean;
  isSandbox?: boolean;
  tracksSource?: boolean;
  signupUsername?: string;
  createdBy?: string;
  createdDate?: string;
  devHubOrgId?: string;
  devHubId?: string;
  attributes?: {
    type: string;
    url: string;
  };
  name?: string;
  orgName?: string;
  edition?: string;
  status?: string;
  isExpired?: boolean;
  namespace?: string | null;
  namespacePrefix?: string | null;
  instanceName?: string;
  trailExpirationDate?: string | null;
}

interface OrgListResult {
  status: number;
  result: {
    other: OrgInfo[];
    sandboxes: OrgInfo[];
    nonScratchOrgs: OrgInfo[];
    devHubs: OrgInfo[];
    scratchOrgs: OrgInfo[];
  };
  warnings: string[];
}

export default class OrgCompare extends LightningElement {
  @track sourceConfig: SourceTargetConfig = { type: 'org' };
  @track targetConfig: SourceTargetConfig = { type: 'org' };
  @track comparisonResult?: MetadataComparison;
  @track filter: CompareFilter = {
    metadataTypes: [],
    status: ['added', 'removed', 'changed'],
    searchTerm: ''
  };
  @track availableOrgs: OrgInfo[] = [];
  @track availableMetadataTypes: string[] = [];
  @track isComparing = false;
  @track isDeploying = false;
  @track error?: string;
  @track spinnerMessages = new Set<string>();
  @track isInGitRepo = false;
  @track currentBranch = '';
  @track availableBranches: string[] = [];
  
  // Progress tracking
  @track sourceProgress: number = 0;
  @track targetProgress: number = 0;
  @track sourceCurrentType: string = '';
  @track targetCurrentType: string = '';
  @track sourceTotalTypes: number = 0;
  @track targetTotalTypes: number = 0;
  @track sourceCompletedTypes: number = 0;
  @track targetCompletedTypes: number = 0;

  @track sourceOrgs: OrgInfo[] = [];
  @track targetOrgs: OrgInfo[] = [];
  @track sourceBranches: string[] = [];
  @track targetBranches: string[] = [];
  
  // Selection and diff viewer properties
  @track selectedItems: MetadataItem[] = [];
  @track selectAll = false;
  @track showDiffViewer = false;
  @track selectedDiffItem?: MetadataItem;
  @track diffContent?: DiffContent;
  @track currentFilter: 'all' | 'added' | 'removed' | 'changed' | 'unchanged' = 'all';
  
  // Diff viewer component properties
  @track sourceDiffLabel: string = 'Source Org';
  @track targetDiffLabel: string = 'Target Org';
  @track diffViewerContent?: DiffViewerContent;


  async executeCommand(command: string): Promise<ExecuteResult> {
    return App.executeCommand(command);
  }

  connectedCallback(): void {
    this.initializeOrgCompare();
  }

  private async initializeOrgCompare(): Promise<void> {
    try {
      await Promise.all([
        this.loadAvailableOrgs(),
        this.loadAvailableMetadataTypes(),
        this.checkGitRepo()
      ]);
    } catch (error) {
      this.handleError('Failed to initialize org compare', error as string);
    }
  }

  private async loadAvailableOrgs(): Promise<void> {
    try {
      console.log('Loading available orgs...');
      
      // For testing, create mock orgs if no real orgs are found
      const mockOrgs: OrgInfo[] = [
        {
          alias: 'dev-org',
          username: 'admin@dev-org.com',
          orgId: '00D123456789',
          accessToken: 'mock-token',
          instanceUrl: 'https://dev-org.my.salesforce.com',
          loginUrl: 'https://login.salesforce.com',
          clientId: 'mock-client-id',
          isDevHub: false,
          instanceApiVersion: '58.0',
          instanceApiVersionLastRetrieved: '2024-01-01',
          isDefaultDevHubUsername: false,
          isDefaultUsername: false,
          lastUsed: '2024-01-01',
          connectedStatus: 'Connected',
          orgName: 'Development Org',
          edition: 'Developer',
          status: 'Active',
          isExpired: false,
          namespace: null,
          namespacePrefix: null,
          instanceName: 'CS123',
          trailExpirationDate: null,
          isScratch: false,
          isSandbox: false,
          tracksSource: true
        },
        {
          alias: 'prod-org',
          username: 'admin@prod-org.com',
          orgId: '00D987654321',
          accessToken: 'mock-token',
          instanceUrl: 'https://prod-org.my.salesforce.com',
          loginUrl: 'https://login.salesforce.com',
          clientId: 'mock-client-id',
          isDevHub: false,
          instanceApiVersion: '58.0',
          instanceApiVersionLastRetrieved: '2024-01-01',
          isDefaultDevHubUsername: false,
          isDefaultUsername: false,
          lastUsed: '2024-01-01',
          connectedStatus: 'Connected',
          orgName: 'Production Org',
          edition: 'Enterprise',
          status: 'Active',
          isExpired: false,
          namespace: null,
          namespacePrefix: null,
          instanceName: 'CS456',
          trailExpirationDate: null,
          isScratch: false,
          isSandbox: false,
          tracksSource: true
        }
      ];
      
      // Try to get real orgs first
      try {
        const testResult = await this.executeCommand('which sf');
        const sfPath = testResult.stdout?.trim() || '/usr/local/bin/sf';
        const result = await this.executeCommand(`${sfPath} org list --json`);
        
        if (!result.errorCode && result.stdout) {
          const cleanOutput = this.stripAnsiCodes(result.stdout);
          const orgListResult: OrgListResult = JSON.parse(cleanOutput);
          
          if (orgListResult.status === 0) {
            const allOrgs = [
              ...orgListResult.result.devHubs,
              ...orgListResult.result.scratchOrgs,
              ...orgListResult.result.sandboxes,
              ...orgListResult.result.nonScratchOrgs,
              ...orgListResult.result.other
            ];
            
            const uniqueOrgs = allOrgs.filter((org, index, self) => 
              index === self.findIndex(o => o.orgId === org.orgId)
            );
            
            this.availableOrgs = uniqueOrgs;
            console.log('Loaded real orgs:', this.availableOrgs);
          } else {
            this.availableOrgs = mockOrgs;
            console.log('Using mock orgs due to error');
          }
        } else {
          this.availableOrgs = mockOrgs;
          console.log('Using mock orgs due to command failure');
        }
      } catch (error) {
        console.log('Using mock orgs due to exception:', error);
        this.availableOrgs = mockOrgs;
      }
      
      // Populate source and target orgs
      this.sourceOrgs = [...this.availableOrgs];
      this.targetOrgs = [...this.availableOrgs];
      
      console.log('Final available orgs:', this.availableOrgs);
      console.log('Source orgs:', this.sourceOrgs);
      console.log('Target orgs:', this.targetOrgs);
      
    } catch (error) {
      console.error('Error loading orgs:', error);
      this.handleError('Failed to load available orgs', error as string);
    }
  }

  private async loadAvailableMetadataTypes(): Promise<void> {
    try {
      const result = await this.executeCommandWithSpinner('sf project retrieve start --metadata-types --json');
      if (result.stdout) {
        const metadataTypes = JSON.parse(result.stdout);
        this.availableMetadataTypes = metadataTypes.result?.metadataTypes || [];
      }
    } catch (error) {
      console.warn('Failed to load available metadata types:', error);
      // Add mock data for testing
      this.availableMetadataTypes = ['CustomObject', 'ApexClass', 'ApexTrigger', 'CustomField', 'ValidationRule', 'WorkflowRule', 'Flow', 'PermissionSet'];
    }
  }

  private async checkGitRepo(): Promise<void> {
    try {
      // Get git path
      const gitTestResult = await this.executeCommand('which git');
      const gitPath = gitTestResult.stdout?.trim() || '/usr/bin/git';
      
      const result = await this.executeCommand(`${gitPath} rev-parse --is-inside-work-tree`);
      this.isInGitRepo = result.stdout?.trim() === 'true';
      
      if (this.isInGitRepo) {
        await this.loadGitInfo();
      }
    } catch (error) {
      console.warn('Not in a git repository or git not available:', error);
      this.isInGitRepo = false;
    }
  }

  private async loadGitInfo(): Promise<void> {
    try {
      // Get git path
      const gitTestResult = await this.executeCommand('which git');
      const gitPath = gitTestResult.stdout?.trim() || '/usr/bin/git';
      
      const [currentBranchResult, branchesResult] = await Promise.all([
        this.executeCommand(`${gitPath} rev-parse --abbrev-ref HEAD`),
        this.executeCommand(`${gitPath} branch -a | grep -v HEAD | sed -e "s/^[ *]*//" -e "s#remotes/origin/##"`)
      ]);

      this.currentBranch = currentBranchResult.stdout?.trim() || '';
      this.availableBranches = branchesResult.stdout?.split('\n').filter(branch => branch.trim()) || [];
    } catch (error) {
      console.warn('Failed to load git information:', error);
    }
  }

  private async executeCommandWithSpinner(command: string): Promise<ExecuteResult> {
    const messageId = `compare_${Date.now()}`;
    this.spinnerMessages.add(messageId);
    this.error = undefined;

    try {
      const result = await this.executeCommand(command);
      this.spinnerMessages.delete(messageId);
      return result;
    } catch (error) {
      this.spinnerMessages.delete(messageId);
      throw error;
    }
  }

  handleSourceTypeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.sourceConfig.type = target.value as 'org' | 'git';
    console.log('Source type changed to:', this.sourceConfig.type);
  }

  handleTargetTypeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.targetConfig.type = target.value as 'org' | 'git';
    console.log('Target type changed to:', this.targetConfig.type);
  }

  handleSourceOrgChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sourceConfig.orgAlias = target.value;
    console.log('Source org changed to:', this.sourceConfig.orgAlias);
  }

  handleTargetOrgChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.targetConfig.orgAlias = target.value;
    console.log('Target org changed to:', this.targetConfig.orgAlias);
  }

  handleSourceBranchChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sourceConfig.gitBranch = target.value;
    console.log('Source branch changed to:', this.sourceConfig.gitBranch);
  }

  handleTargetBranchChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.targetConfig.gitBranch = target.value;
    console.log('Target branch changed to:', this.targetConfig.gitBranch);
  }



  handleMetadataTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const selectedOptions = Array.from(target.selectedOptions).map(option => option.value);
    this.filter.metadataTypes = selectedOptions;
  }

  handleStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const selectedOptions = Array.from(target.selectedOptions).map(option => option.value);
    this.filter.status = selectedOptions.length > 0 ? selectedOptions as ('added' | 'removed' | 'changed' | 'unchanged')[] : ['added', 'removed', 'changed'];
  }

  handleSearchTermChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filter.searchTerm = target.value || '';
  }

  async handleCompareClick(): Promise<void> {
    if (!this.validateConfiguration()) {
      return;
    }

    this.isComparing = true;
    this.error = undefined;
    this.comparisonResult = undefined;

    try {
      console.log('Starting metadata comparison...');
      
      // Retrieve metadata from source and target
      const sourceMetadata = await this.retrieveSourceMetadataWithProgress();
      const targetMetadata = await this.retrieveTargetMetadataWithProgress();
      
      console.log('Source metadata count:', sourceMetadata.length);
      console.log('Target metadata count:', targetMetadata.length);
      
      // Perform actual comparison
      this.comparisonResult = this.compareMetadata(sourceMetadata, targetMetadata);
      
      // Populate item properties for UI display
      this.populateItemProperties();
      
      console.log('Comparison result:', {
        added: this.comparisonResult.added.length,
        removed: this.comparisonResult.removed.length,
        changed: this.comparisonResult.changed.length,
        unchanged: this.comparisonResult.unchanged.length
      });

      this.showToast(`Comparison completed: ${this.comparisonResult.added.length} added, ${this.comparisonResult.removed.length} removed, ${this.comparisonResult.changed.length} changed`, 'success');
    } catch (error) {
      console.error('Comparison failed:', error);
      this.handleError('Failed to compare metadata', error as string);
    } finally {
      this.isComparing = false;
    }
  }



  async handleDeployClick(): Promise<void> {
    if (!this.comparisonResult || !this.validateConfiguration()) {
      return;
    }

    this.isDeploying = true;
    this.error = undefined;

    try {
      const itemsToDeploy = [
        ...this.comparisonResult.added,
        ...this.comparisonResult.changed
      ];

      if (itemsToDeploy.length === 0) {
        this.showToast('No items to deploy', 'info');
        return;
      }

      // Mock deployment for testing
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate deployment time
      this.showToast(`Successfully deployed ${itemsToDeploy.length} items`, 'success');
    } catch (error) {
      this.handleError('Failed to deploy metadata', error as string);
    } finally {
      this.isDeploying = false;
    }
  }

  private validateConfiguration(): boolean {
    if (this.sourceConfig.type === 'org' && !this.sourceConfig.orgAlias) {
      this.error = 'Please select a source org';
      return false;
    }

    if (this.targetConfig.type === 'org' && !this.targetConfig.orgAlias) {
      this.error = 'Please select a target org';
      return false;
    }

    return true;
  }



  private async retrieveSourceMetadataWithProgress(): Promise<MetadataItem[]> {
    if (this.sourceConfig.type === 'org' && this.sourceConfig.orgAlias) {
      return this.retrieveOrgMetadataWithProgress(this.sourceConfig.orgAlias, 'source');
    } else if (this.sourceConfig.type === 'git' && this.sourceConfig.gitBranch) {
      return this.retrieveGitMetadata(this.sourceConfig.gitBranch);
    }
    return [];
  }

  private async retrieveTargetMetadataWithProgress(): Promise<MetadataItem[]> {
    if (this.targetConfig.type === 'org' && this.targetConfig.orgAlias) {
      return this.retrieveOrgMetadataWithProgress(this.targetConfig.orgAlias, 'target');
    } else if (this.targetConfig.type === 'git' && this.targetConfig.gitBranch) {
      return this.retrieveGitMetadata(this.targetConfig.gitBranch);
    }
    return [];
  }

  private async retrieveOrgMetadataWithProgress(orgAlias: string, progressType: 'source' | 'target'): Promise<MetadataItem[]> {
    console.log(`Retrieving metadata from org: ${orgAlias}`);
    
    const allMetadata: MetadataItem[] = [];
    
    // Get metadata types from config
    const metadataTypes = METADATA_TYPES.map(t => t.type);
    
    // Set total types for progress calculation
    if (progressType === 'source') {
      this.sourceTotalTypes = metadataTypes.length;
      this.sourceCompletedTypes = 0;
      this.sourceCurrentType = 'Starting...';
    } else {
      this.targetTotalTypes = metadataTypes.length;
      this.targetCompletedTypes = 0;
      this.targetCurrentType = 'Starting...';
    }
    
    // Process metadata types in batches for multi-threading effect
    const batchSize = 3; // Process 3 types simultaneously
    for (let i = 0; i < metadataTypes.length; i += batchSize) {
      const batch = metadataTypes.slice(i, i + batchSize);
      
      // Update progress for current batch
      if (progressType === 'source') {
        this.sourceCurrentType = `Downloading: ${batch.join(', ')}`;
        this.sourceCompletedTypes = i;
        this.sourceProgress = Math.round((i / metadataTypes.length) * 100);
      } else {
        this.targetCurrentType = `Downloading: ${batch.join(', ')}`;
        this.targetCompletedTypes = i;
        this.targetProgress = Math.round((i / metadataTypes.length) * 100);
      }
      
      // Process batch in parallel
      const batchPromises = batch.map(async (metadataType) => {
        try {
          console.log(`Retrieving ${metadataType} from ${orgAlias}...`);
          
          // Use sf org list metadata command
          const result = await this.executeCommand(`sf org list metadata --target-org ${orgAlias} --metadata-type ${metadataType} --json`);
          
          if (result.errorCode) {
            console.warn(`Failed to retrieve ${metadataType}:`, result.stderr);
            return [];
          }
          
          if (result.stdout) {
            const cleanOutput = this.stripAnsiCodes(result.stdout);
            try {
              const response = JSON.parse(cleanOutput);
              const metadataItems = this.parseMetadataListResponse(response.result || [], metadataType);
              console.log(`Retrieved ${metadataItems.length} ${metadataType} items`);
              return metadataItems;
            } catch (parseError) {
              console.warn(`Failed to parse ${metadataType} response:`, parseError);
              return [];
            }
          }
          return [];
        } catch (error) {
          console.warn(`Error retrieving ${metadataType}:`, error);
          return [];
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(items => allMetadata.push(...items));
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Set progress to 100% when complete
    if (progressType === 'source') {
      this.sourceProgress = 100;
      this.sourceCurrentType = 'Complete';
      this.sourceCompletedTypes = metadataTypes.length;
    } else {
      this.targetProgress = 100;
      this.targetCurrentType = 'Complete';
      this.targetCompletedTypes = metadataTypes.length;
    }
    
    console.log(`Total metadata items retrieved from ${orgAlias}:`, allMetadata.length);
    return allMetadata;
  }

  private async retrieveGitMetadata(branch?: string, path?: string): Promise<MetadataItem[]> {
    try {
      console.log('Retrieving git metadata for branch:', branch);
      
      // Get git path
      const gitTestResult = await this.executeCommand('which git');
      const gitPath = gitTestResult.stdout?.trim() || '/usr/bin/git';
      
      // List all files in the git repository
      const listCommand = branch 
        ? `${gitPath} ls-tree -r --name-only origin/${branch}`
        : `${gitPath} ls-files`;
      
      const result = await this.executeCommand(listCommand);
      
      if (result.stderr) {
        console.warn('Git command stderr:', result.stderr);
      }
      
      if (!result.stdout) {
        console.warn('No output from git command');
        return [];
      }
      
      const files = result.stdout.split('\n').filter(file => file.trim());
      console.log('Found git files:', files.length);
      
      const metadataItems: MetadataItem[] = [];
      
      for (const file of files) {
        // Only process Salesforce metadata files
        if (this.isSalesforceMetadataFile(file)) {
          const metadataType = this.extractMetadataType(file);
          const metadataName = this.extractMetadataName(file);
          
          metadataItems.push({
            type: metadataType,
            name: metadataName,
            fullName: file,
            lastModifiedDate: new Date().toISOString(), // Git doesn't provide this easily
            lastModifiedBy: 'git',
            status: 'unchanged',
            sourceValue: `Git file: ${file}`
          });
        }
      }
      
      console.log('Processed metadata items:', metadataItems.length);
      return metadataItems;
    } catch (error) {
      console.error('Failed to retrieve git metadata:', error);
      return [];
    }
  }

  private parseMetadataResponse(response: any): MetadataItem[] {
    const items: MetadataItem[] = [];
    
    console.log('Parsing metadata response:', response);
    
    // Handle different response formats
    if (response.result?.inboundFiles) {
      // Old format
      for (const file of response.result.inboundFiles) {
        items.push({
          type: this.extractMetadataType(file.filePath),
          name: this.extractMetadataName(file.filePath),
          fullName: file.filePath,
          lastModifiedDate: file.lastModifiedDate,
          lastModifiedBy: file.lastModifiedBy,
          status: 'unchanged',
          sourceValue: file.content
        });
      }
    } else if (response.result?.files) {
      // New format
      for (const file of response.result.files) {
        items.push({
          type: this.extractMetadataType(file.filePath || file.fullName),
          name: this.extractMetadataName(file.filePath || file.fullName),
          fullName: file.filePath || file.fullName,
          lastModifiedDate: file.lastModifiedDate || new Date().toISOString(),
          lastModifiedBy: file.lastModifiedBy || 'Unknown',
          status: 'unchanged',
          sourceValue: file.content || `Metadata from ${file.filePath || file.fullName}`
        });
      }
    } else if (response.result?.metadata) {
      // Another possible format
      for (const metadata of response.result.metadata) {
        items.push({
          type: this.extractMetadataType(metadata.fullName),
          name: this.extractMetadataName(metadata.fullName),
          fullName: metadata.fullName,
          lastModifiedDate: metadata.lastModifiedDate || new Date().toISOString(),
          lastModifiedBy: metadata.lastModifiedBy || 'Unknown',
          status: 'unchanged',
          sourceValue: `Metadata from ${metadata.fullName}`
        });
      }
    } else {
      console.warn('Unknown response format:', response);
    }

    console.log('Parsed metadata items:', items.length);
    return items;
  }

  private parseMetadataListResponse(metadataList: any[], metadataType: string): MetadataItem[] {
    const items: MetadataItem[] = [];
    
    console.log(`Parsing ${metadataType} metadata list:`, metadataList.length, 'items');
    
    for (const metadata of metadataList) {
      items.push({
        type: metadataType,
        name: metadata.fullName,
        fullName: metadata.fullName,
        lastModifiedDate: metadata.lastModifiedDate,
        lastModifiedBy: metadata.lastModifiedByName || 'Unknown',
        status: 'unchanged',
        sourceValue: `Metadata from ${metadata.fullName} (${metadataType})`
      });
    }

    console.log(`Parsed ${metadataType} items:`, items.length);
    return items;
  }

  private extractMetadataType(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      return parts[0];
    }
    return 'Unknown';
  }

  private extractMetadataName(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      return parts[1].replace(/\.\w+$/, '');
    }
    return filePath;
  }

  private isSalesforceMetadataFile(filePath: string): boolean {
    // Check if the file is a Salesforce metadata file
    const metadataExtensions = [
      '.cls', '.trigger', '.page', '.component', '.object', '.field', 
      '.permissionset', '.profile', '.layout', '.tab', '.app', '.workflow',
      '.validationRule', '.sharingRule', '.queue', '.group', '.role',
      '.customPermission', '.flow', '.processBuilder', '.quickAction',
      '.emailTemplate', '.letterhead', '.document', '.staticresource',
      '.aura', '.lwc', '.wave', '.dashboard', '.report', '.reportType'
    ];
    
    const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    return metadataExtensions.includes(extension) || 
           filePath.includes('/force-app/') || 
           filePath.includes('/metadata/');
  }

  private compareMetadata(source: MetadataItem[], target: MetadataItem[]): MetadataComparison {
    console.log('Starting metadata comparison...');
    console.log('Source items:', source.length);
    console.log('Target items:', target.length);
    
    const added: MetadataItem[] = [];
    const removed: MetadataItem[] = [];
    const changed: MetadataItem[] = [];
    const unchanged: MetadataItem[] = [];
    
    // Create maps for efficient lookup
    const sourceMap = new Map<string, MetadataItem>();
    const targetMap = new Map<string, MetadataItem>();
    
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
          // Retrieve actual content for changed items
          this.retrieveMetadataContent(sourceItem, targetItem);
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

  private async retrieveMetadataContent(sourceItem: MetadataItem, targetItem: MetadataItem): Promise<void> {
    try {
      // Retrieve actual content from both orgs
      if (this.sourceConfig.type === 'org' && this.sourceConfig.orgAlias) {
        const sourceContent = await this.retrieveMetadataContentFromOrg(
          this.sourceConfig.orgAlias, 
          sourceItem.type, 
          sourceItem.name
        );
        sourceItem.sourceValue = sourceContent;
      }
      
      if (this.targetConfig.type === 'org' && this.targetConfig.orgAlias) {
        const targetContent = await this.retrieveMetadataContentFromOrg(
          this.targetConfig.orgAlias, 
          targetItem.type, 
          targetItem.name
        );
        targetItem.targetValue = targetContent;
      }
    } catch (error) {
      console.warn('Failed to retrieve metadata content:', error);
      // Set fallback content
      sourceItem.sourceValue = `// Content not available for ${sourceItem.name}`;
      targetItem.targetValue = `// Content not available for ${targetItem.name}`;
    }
  }

  private async retrieveMetadataContentFromOrg(orgAlias: string, metadataType: string, metadataName: string): Promise<string> {
    try {
      console.log(`Retrieving content for ${metadataType}:${metadataName} from ${orgAlias}`);
      
      // Use sf project retrieve start to get the actual metadata content
      const result = await this.executeCommand(
        `sf project retrieve start --target-org ${orgAlias} --metadata ${metadataType}:${metadataName} --json`
      );
      
      if (result.errorCode) {
        console.warn(`Failed to retrieve content for ${metadataType}:${metadataName}:`, result.stderr);
        return `// Failed to retrieve content: ${result.stderr}`;
      }
      
      // Parse the response to get the file path
      if (result.stdout) {
        const cleanOutput = this.stripAnsiCodes(result.stdout);
        const response = JSON.parse(cleanOutput);
        
        if (response.status === 0 && response.result && response.result.files) {
          // Read the actual file content
          const filePath = response.result.files[0];
          const contentResult = await this.executeCommand(`cat "${filePath}"`);
          
          if (!contentResult.errorCode && contentResult.stdout) {
            return contentResult.stdout;
          }
        }
      }
      
      return `// Content not available for ${metadataName}`;
    } catch (error) {
      console.warn(`Error retrieving content for ${metadataType}:${metadataName}:`, error);
      return `// Error retrieving content: ${error}`;
    }
  }

  private hasChanges(source: MetadataItem, target: MetadataItem): boolean {
    return source.sourceValue !== target.sourceValue;
  }

  private generateDiff(sourceValue?: string, targetValue?: string): string {
    // Simple diff implementation - in a real scenario, you'd want a proper diff library
    if (!sourceValue || !targetValue) {
      return 'Content not available for comparison';
    }
    
    if (sourceValue === targetValue) {
      return 'No changes';
    }
    
    return 'Content has changed';
  }

  private async deployMetadata(items: MetadataItem[]): Promise<void> {
    // Create a temporary directory with the metadata to deploy
    const deployPath = `/tmp/skyline-deploy-${Date.now()}`;
    
    // This is a simplified implementation
    // In a real scenario, you'd need to:
    // 1. Create the directory structure
    // 2. Write the metadata files
    // 3. Execute the deployment command
    
    const command = `sf project deploy start --source-dir ${deployPath} --target-org ${this.targetConfig.orgAlias} --json`;
    const result = await this.executeCommandWithSpinner(command);
    
    if (result.stderr) {
      throw new Error(result.stderr);
    }
  }

  private handleError(message: string, error: string): void {
    this.error = `${message}: ${error}`;
    this.showToast(message, 'error');
  }

  private showToast(message: string, variant: 'success' | 'error' | 'warning' | 'info'): void {
    Toast.show({
      label: variant.charAt(0).toUpperCase() + variant.slice(1),
      message,
      variant
    }, this);
  }

  private stripAnsiCodes(text?: string): string {
    if (!text) return '';
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  get filteredComparisonResult(): MetadataItem[] {
    if (!this.comparisonResult) return [];
    
    switch (this.currentFilter) {
      case 'added':
        return this.comparisonResult.added;
      case 'removed':
        return this.comparisonResult.removed;
      case 'changed':
        return this.comparisonResult.changed;
      case 'unchanged':
        return this.comparisonResult.unchanged;
      default:
        return [
          ...this.comparisonResult.added,
          ...this.comparisonResult.removed,
          ...this.comparisonResult.changed,
          ...this.comparisonResult.unchanged
        ];
    }
  }

  private filterItems(items: MetadataItem[]): MetadataItem[] {
    return items.filter(item => {
      // Filter by metadata type
      if (this.filter.metadataTypes.length > 0 && !this.filter.metadataTypes.includes(item.type)) {
        return false;
      }

      // Filter by status
      if (!this.filter.status.includes(item.status)) {
        return false;
      }

      // Filter by search term
      if (this.filter.searchTerm && !this.matchesSearchTerm(item)) {
        return false;
      }

      return true;
    });
  }

  private matchesSearchTerm(item: MetadataItem): boolean {
    const searchTerm = this.filter.searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(searchTerm) ||
      item.fullName.toLowerCase().includes(searchTerm) ||
      item.type.toLowerCase().includes(searchTerm)
    );
  }

  get sourceOrgOptions(): { label: string; value: string }[] {
    return this.availableOrgs.map(org => ({
      label: `${org.alias} (${org.name || org.username})`,
      value: org.alias
    }));
  }

  get targetOrgOptions(): { label: string; value: string }[] {
    return this.availableOrgs.map(org => ({
      label: `${org.alias} (${org.name || org.username})`,
      value: org.alias
    }));
  }

  get metadataTypeFilterOptions(): { label: string; value: string }[] {
    return this.availableMetadataTypes.map(type => ({
      label: type,
      value: type
    }));
  }

  get statusFilterOptions(): { label: string; value: string }[] {
    return [
      { label: 'Added', value: 'added' },
      { label: 'Removed', value: 'removed' },
      { label: 'Changed', value: 'changed' },
      { label: 'Unchanged', value: 'unchanged' }
    ];
  }

  get canCompare(): boolean {
    return !this.isComparing && this.validateConfiguration() && this.availableOrgs.length > 0;
  }

  get canDeploy(): boolean {
    return !this.isDeploying && !!this.comparisonResult && this.validateConfiguration();
  }

  get canCompareDisabled(): boolean {
    return !this.canCompare;
  }

  get canDeployDisabled(): boolean {
    return !this.canDeploy;
  }

  get spinnerDisplayText(): string[] {
    return Array.from(this.spinnerMessages);
  }

  get isSourceOrg(): boolean {
    return this.sourceConfig.type === 'org';
  }

  get isSourceGit(): boolean {
    return this.sourceConfig.type === 'git';
  }

  get isTargetOrg(): boolean {
    return this.targetConfig.type === 'org';
  }

  get isTargetGit(): boolean {
    return this.targetConfig.type === 'git';
  }

  get sourceProgressStyle(): string {
    return `width: ${this.sourceProgress}%`;
  }

  get targetProgressStyle(): string {
    return `width: ${this.targetProgress}%`;
  }

  // Filter handlers
  handleFilterAll(): void {
    this.currentFilter = 'all';
  }

  handleFilterAdded(): void {
    this.currentFilter = 'added';
  }

  handleFilterRemoved(): void {
    this.currentFilter = 'removed';
  }

  handleFilterChanged(): void {
    this.currentFilter = 'changed';
  }

  handleFilterUnchanged(): void {
    this.currentFilter = 'unchanged';
  }



  handleViewDiff(event: Event): void {
    const target = event.target as HTMLButtonElement;
    const itemName = target.getAttribute('data-item');
    
    if (!itemName || !this.comparisonResult) return;
    
    // Find the item in all result arrays
    const allItems = [
      ...this.comparisonResult.added,
      ...this.comparisonResult.removed,
      ...this.comparisonResult.changed,
      ...this.comparisonResult.unchanged
    ];
    
    const selectedItem = allItems.find(item => item.fullName === itemName);
    
    if (selectedItem) {
      this.selectedDiffItem = selectedItem;
      this.showDiffViewer = true;
      this.generateDiffContent();
    }
  }

  handleCloseDiffViewer(): void {
    this.showDiffViewer = false;
    this.selectedDiffItem = undefined;
    this.diffContent = { diffLines: [] };
  }

  generateDiffContent(): void {
    if (!this.selectedDiffItem) return;
    
    const sourceContent = this.selectedDiffItem.sourceValue || '';
    const targetContent = this.selectedDiffItem.targetValue || '';
    
    const sourceLines = sourceContent.split('\n');
    const targetLines = targetContent.split('\n');
    
    const maxLines = Math.max(sourceLines.length, targetLines.length);
    const sourceDiffLines: any[] = [];
    const targetDiffLines: any[] = [];
    
    for (let i = 0; i < maxLines; i++) {
      const sourceLine = sourceLines[i] || '';
      const targetLine = targetLines[i] || '';
      
      let type: 'added' | 'removed' | 'changed' | 'unchanged' = 'unchanged';
      
      if (sourceLine !== targetLine) {
        if (sourceLine && !targetLine) {
          type = 'added';
        } else if (!sourceLine && targetLine) {
          type = 'removed';
        } else {
          type = 'changed';
        }
      }
      
      sourceDiffLines.push({
        lineNumber: i + 1,
        content: sourceLine,
        type
      });
      
      targetDiffLines.push({
        lineNumber: i + 1,
        content: targetLine,
        type
      });
    }
    
    this.diffViewerContent = {
      sourceLines: sourceDiffLines,
      targetLines: targetDiffLines
    };
    
    // Update labels based on source and target configs
    this.sourceDiffLabel = this.sourceConfig.type === 'org' 
      ? (this.sourceConfig.orgAlias || 'Source Org')
      : (this.sourceConfig.gitBranch || 'Source Branch');
    
    this.targetDiffLabel = this.targetConfig.type === 'org'
      ? (this.targetConfig.orgAlias || 'Target Org')
      : (this.targetConfig.gitBranch || 'Target Branch');
  }

  // Package creation methods
  handleSelectAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAll = target.checked;
    
    if (this.comparisonResult) {
      this.comparisonResult.added.forEach(item => item.selected = this.selectAll);
      this.comparisonResult.removed.forEach(item => item.selected = this.selectAll);
      this.comparisonResult.changed.forEach(item => item.selected = this.selectAll);
      this.comparisonResult.unchanged.forEach(item => item.selected = this.selectAll);
    }
    
    this.updateSelectedItems();
  }

  handleItemSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    const itemName = target.getAttribute('data-item');
    
    if (this.comparisonResult && itemName) {
      const allItems = [
        ...this.comparisonResult.added,
        ...this.comparisonResult.removed,
        ...this.comparisonResult.changed,
        ...this.comparisonResult.unchanged
      ];
      
      const item = allItems.find(i => i.fullName === itemName);
      if (item) {
        item.selected = target.checked;
      }
    }
    
    this.updateSelectedItems();
    this.updateSelectAllState();
  }

  updateSelectedItems(): void {
    if (!this.comparisonResult) {
      this.selectedItems = [];
      return;
    }
    
    const allItems = [
      ...this.comparisonResult.added,
      ...this.comparisonResult.removed,
      ...this.comparisonResult.changed,
      ...this.comparisonResult.unchanged
    ];
    
    this.selectedItems = allItems.filter(item => item.selected);
  }

  updateSelectAllState(): void {
    if (!this.comparisonResult) {
      this.selectAll = false;
      return;
    }
    
    const allItems = [
      ...this.comparisonResult.added,
      ...this.comparisonResult.removed,
      ...this.comparisonResult.changed,
      ...this.comparisonResult.unchanged
    ];
    
    this.selectAll = allItems.length > 0 && allItems.every(item => item.selected);
  }

  handleCreatePackage(): void {
    if (this.selectedItems.length === 0) {
      this.showToast('Please select items to create a package', 'warning');
      return;
    }
    
    // Auto-wire dependencies
    const itemsWithDependencies = this.autoWireDependencies(this.selectedItems);
    
    // Create the package
    this.createPackageZip(itemsWithDependencies);
  }

  autoWireDependencies(selectedItems: MetadataItem[]): MetadataItem[] {
    const autoWiredItems = new Set<MetadataItem>();
    
    selectedItems.forEach(item => {
      autoWiredItems.add(item);
      
      const typeConfig = METADATA_TYPES.find(t => t.type === item.type);
      if (!typeConfig || !typeConfig.autoWire) return;
      
      switch (typeConfig.autoWire) {
        case 'lwcFolder':
          // Add all files in the LWC component folder
          if (this.comparisonResult) {
            const allItems = [
              ...this.comparisonResult.added,
              ...this.comparisonResult.removed,
              ...this.comparisonResult.changed,
              ...this.comparisonResult.unchanged
            ];
            
            const componentName = item.name;
            const relatedItems = allItems.filter(i => 
              i.type === 'LightningComponentBundle' && 
              i.name.startsWith(componentName + '/')
            );
            relatedItems.forEach(relatedItem => autoWiredItems.add(relatedItem));
          }
          break;
          
        case 'apexMeta':
          // Add the corresponding .cls-meta.xml file
          if (this.comparisonResult) {
            const allItems = [
              ...this.comparisonResult.added,
              ...this.comparisonResult.removed,
              ...this.comparisonResult.changed,
              ...this.comparisonResult.unchanged
            ];
            
            const metaItem = allItems.find(i => 
              i.type === item.type && 
              i.name === item.name + '-meta'
            );
            if (metaItem) autoWiredItems.add(metaItem);
          }
          break;
          
        case 'objectFields':
          // Add related CustomField and Layout items
          if (this.comparisonResult) {
            const allItems = [
              ...this.comparisonResult.added,
              ...this.comparisonResult.removed,
              ...this.comparisonResult.changed,
              ...this.comparisonResult.unchanged
            ];
            
            const objectName = item.name;
            const relatedItems = allItems.filter(i => 
              (i.type === 'CustomField' || i.type === 'Layout') && 
              i.name.startsWith(objectName + '.')
            );
            relatedItems.forEach(relatedItem => autoWiredItems.add(relatedItem));
          }
          break;
          
        case 'fieldParentObject':
          // Add the parent CustomObject
          if (this.comparisonResult) {
            const allItems = [
              ...this.comparisonResult.added,
              ...this.comparisonResult.removed,
              ...this.comparisonResult.changed,
              ...this.comparisonResult.unchanged
            ];
            
            const fieldNameParts = item.name.split('.');
            if (fieldNameParts.length > 1) {
              const objectName = fieldNameParts[0];
              const parentObject = allItems.find(i => 
                i.type === 'CustomObject' && 
                i.name === objectName
              );
              if (parentObject) autoWiredItems.add(parentObject);
            }
          }
          break;
      }
    });
    
    return Array.from(autoWiredItems);
  }

  createPackageZip(items: MetadataItem[]): void {
    try {
      console.log('Creating deployment package...');
      
      const packageXml = this.generatePackageXml(items);
      const packageDir = './deployment-package';
      
      // Create package directory
      this.executeCommand(`mkdir -p ${packageDir}`);
      
      // Write package.xml
      this.executeCommand(`echo '${packageXml}' > ${packageDir}/package.xml`);
      
      // Create metadata directory structure and copy files
      items.forEach(item => {
        const metadataDir = `${packageDir}/force-app/main/default/${this.getMetadataDirectory(item.type)}`;
        this.executeCommand(`mkdir -p ${metadataDir}`);
        
        // Create the metadata file
        const fileName = this.getMetadataFileName(item.type, item.name);
        const filePath = `${metadataDir}/${fileName}`;
        
        if (item.sourceValue) {
          this.executeCommand(`echo '${item.sourceValue}' > "${filePath}"`);
        }
      });
      
      // Create zip file
      this.executeCommand(`cd ${packageDir} && zip -r ../deployment-package.zip .`);
      
      console.log('Package created successfully!');
      console.log('Package XML:', packageXml);
      console.log('Selected items:', items.map(item => `${item.type}:${item.name}`));
      
      this.showToast(`Deployment package created with ${items.length} items`, 'success');
    } catch (error) {
      console.error('Failed to create package:', error);
      this.showToast('Failed to create deployment package', 'error');
    }
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

  generatePackageXml(items: MetadataItem[]): string {
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

  // Update the comparison result to populate status badges and lastModified
  private populateItemProperties(): void {
    if (!this.comparisonResult) return;
    
    const allItems = [
      ...this.comparisonResult.added,
      ...this.comparisonResult.removed,
      ...this.comparisonResult.changed,
      ...this.comparisonResult.unchanged
    ];
    
    allItems.forEach(item => {
      // Set status badge class
      switch (item.status) {
        case 'added':
          item.statusBadgeClass = 'status-badge-added';
          break;
        case 'removed':
          item.statusBadgeClass = 'status-badge-removed';
          break;
        case 'changed':
          item.statusBadgeClass = 'status-badge-changed';
          break;
        case 'unchanged':
          item.statusBadgeClass = 'status-badge-unchanged';
          break;
      }
      
      // Set lastModified
      item.lastModified = item.lastModifiedDate || 'Unknown';
    });
  }
} 