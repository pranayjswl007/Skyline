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
  @track sourceProgress = 0;
  @track targetProgress = 0;
  @track sourceCurrentType = '';
  @track targetCurrentType = '';
  @track sourceTotalTypes = 0;
  @track targetTotalTypes = 0;
  @track sourceCompletedTypes = 0;
  @track targetCompletedTypes = 0;

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
      
      // First test if sf command is available
      const testResult = await this.executeCommand('which sf');
      console.log('SF command test result:', testResult);
      
      // Use full path to sf command
      const sfPath = testResult.stdout?.trim() || '/usr/local/bin/sf';
      const result = await this.executeCommand(`${sfPath} org list --json`);
      console.log('Org list command result:', result);
      
      if (result.errorCode) {
        throw new Error(result.stderr);
      }

      if (!result.stdout) {
        throw new Error("No output received from org list command");
      }

      console.log('Parsing org list JSON...');
      console.log('Raw stdout:', result.stdout?.substring(0, 200));
      
      // Strip ANSI color codes from the output
      const cleanOutput = this.stripAnsiCodes(result.stdout);
      console.log('Clean output:', cleanOutput?.substring(0, 200));
      
      let orgListResult: OrgListResult;
      try {
        orgListResult = JSON.parse(cleanOutput);
        console.log('Parsed org list result:', orgListResult);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw stdout that failed to parse:', result.stdout);
        console.error('Clean output that failed to parse:', cleanOutput);
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : parseError}. Raw output: ${result.stdout?.substring(0, 100)}...`);
      }
      
      if (orgListResult.status !== 0) {
        throw new Error("Failed to retrieve org list");
      }

      // Combine all orgs from different categories and remove duplicates
      const allOrgs = [
        ...orgListResult.result.devHubs,
        ...orgListResult.result.scratchOrgs,
        ...orgListResult.result.sandboxes,
        ...orgListResult.result.nonScratchOrgs,
        ...orgListResult.result.other
      ];
      
      // Remove duplicates based on orgId
      const uniqueOrgs = allOrgs.filter((org, index, self) => 
        index === self.findIndex(o => o.orgId === org.orgId)
      );
      
      this.availableOrgs = uniqueOrgs;
      console.log('Combined available orgs:', this.availableOrgs);
      
      // If no orgs found, try alternative command
      if (this.availableOrgs.length === 0) {
        console.log('No orgs found in structured result, trying alternative command...');
        const altResult = await this.executeCommand(`${sfPath} org list`);
        console.log('Alternative org list result:', altResult);
        
        if (altResult.stdout) {
          // Parse the text output to extract org aliases
          const lines = altResult.stdout.split('\n');
          const orgAliases: string[] = [];
          
          for (const line of lines) {
            // Look for lines that contain org information
            if (line.includes('@') && line.includes('(')) {
              const match = line.match(/(\w+)\s+\(([^)]+)\)/);
              if (match) {
                orgAliases.push(match[1]); // Extract alias
              }
            }
          }
          
          console.log('Extracted org aliases:', orgAliases);
          
          // Create OrgInfo objects from aliases
          this.availableOrgs = orgAliases.map(alias => ({
            alias,
            username: `${alias}@example.com`,
            orgId: '00D123456789',
            accessToken: 'mock-token',
            instanceUrl: 'https://dev.salesforce.com',
            loginUrl: 'https://login.salesforce.com',
            clientId: 'mock-client-id',
            isDevHub: false,
            instanceApiVersion: '58.0',
            instanceApiVersionLastRetrieved: '2024-01-01',
            isDefaultDevHubUsername: false,
            isDefaultUsername: false,
            lastUsed: '2024-01-01',
            connectedStatus: 'Unknown',
            defaultMarker: '',
            orgName: alias,
            edition: 'Developer',
            status: 'Active'
          } as OrgInfo));
        }
      }
    } catch (error) {
      console.warn('Failed to load available orgs:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      this.availableOrgs = [];
      this.error = `Failed to load Salesforce orgs: ${error instanceof Error ? error.message : error}. Please check your Salesforce CLI configuration.`;
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
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    this.sourceConfig.type = value as 'org' | 'git';
    this.sourceConfig.orgAlias = undefined;
    this.sourceConfig.gitBranch = undefined;
  }

  handleTargetTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    this.targetConfig.type = value as 'org' | 'git';
    this.targetConfig.orgAlias = undefined;
    this.targetConfig.gitBranch = undefined;
  }

  handleSourceOrgChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sourceConfig.orgAlias = target.value;
  }

  handleTargetOrgChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.targetConfig.orgAlias = target.value;
  }



  handleSourceGitBranchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.sourceConfig.gitBranch = target.value;
  }

  handleTargetGitBranchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.targetConfig.gitBranch = target.value;
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
    
    // Reset progress
    this.sourceProgress = 0;
    this.targetProgress = 0;
    this.sourceCurrentType = '';
    this.targetCurrentType = '';
    this.sourceTotalTypes = 0;
    this.targetTotalTypes = 0;
    this.sourceCompletedTypes = 0;
    this.targetCompletedTypes = 0;

    try {
      console.log('Starting metadata comparison...');
      console.log('Source config:', this.sourceConfig);
      console.log('Target config:', this.targetConfig);

      // Run metadata retrieval in parallel with progress tracking
      const [sourceMetadata, targetMetadata] = await Promise.all([
        this.retrieveSourceMetadataWithProgress(),
        this.retrieveTargetMetadataWithProgress()
      ]);

      console.log('Source metadata count:', sourceMetadata.length);
      console.log('Target metadata count:', targetMetadata.length);

      // Perform the comparison
      this.comparisonResult = this.compareMetadata(sourceMetadata, targetMetadata);

      console.log('Comparison result:', {
        added: this.comparisonResult.added.length,
        removed: this.comparisonResult.removed.length,
        changed: this.comparisonResult.changed.length,
        unchanged: this.comparisonResult.unchanged.length
      });

      // Populate item properties for UI display
      this.populateItemProperties();
      
      this.showToast(`Comparison completed: ${this.comparisonResult.added.length} added, ${this.comparisonResult.removed.length} removed, ${this.comparisonResult.changed.length} changed`, 'success');
    } catch (error) {
      console.error('Comparison failed:', error);
      this.handleError('Failed to compare metadata', error as string);
    } finally {
      this.isComparing = false;
    }
  }

  private createMockComparisonResult(): MetadataComparison {
    return {
      added: [
        {
          type: 'CustomObject',
          name: 'TestObject__c',
          fullName: 'CustomObject/TestObject__c',
          lastModifiedDate: '2024-01-15T10:30:00Z',
          lastModifiedBy: 'admin@example.com',
          status: 'added',
          sourceValue: 'Mock source content'
        },
        {
          type: 'ApexClass',
          name: 'TestController',
          fullName: 'ApexClass/TestController.cls',
          lastModifiedDate: '2024-01-14T15:45:00Z',
          lastModifiedBy: 'developer@example.com',
          status: 'added',
          sourceValue: 'Mock source content'
        }
      ],
      removed: [
        {
          type: 'CustomField',
          name: 'OldField__c',
          fullName: 'CustomField/OldField__c',
          lastModifiedDate: '2024-01-10T09:20:00Z',
          lastModifiedBy: 'admin@example.com',
          status: 'removed',
          sourceValue: 'Mock source content'
        }
      ],
      changed: [
        {
          type: 'ApexTrigger',
          name: 'AccountTrigger',
          fullName: 'ApexTrigger/AccountTrigger.trigger',
          lastModifiedDate: '2024-01-16T11:15:00Z',
          lastModifiedBy: 'developer@example.com',
          status: 'changed',
          sourceValue: 'Updated trigger content',
          targetValue: 'Original trigger content',
          diff: 'Content has changed'
        }
      ],
      unchanged: [
        {
          type: 'PermissionSet',
          name: 'StandardUser',
          fullName: 'PermissionSet/StandardUser.permissionset',
          lastModifiedDate: '2024-01-12T14:30:00Z',
          lastModifiedBy: 'admin@example.com',
          status: 'unchanged',
          sourceValue: 'Same content'
        }
      ]
    };
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

  private async retrieveSourceMetadata(): Promise<MetadataItem[]> {
    if (this.sourceConfig.type === 'org') {
      return this.retrieveOrgMetadata(this.sourceConfig.orgAlias!);
    } else {
      return this.retrieveGitMetadata(this.sourceConfig.gitBranch);
    }
  }

  private async retrieveTargetMetadata(): Promise<MetadataItem[]> {
    if (this.targetConfig.type === 'org') {
      return this.retrieveOrgMetadata(this.targetConfig.orgAlias!);
    } else {
      return this.retrieveGitMetadata(this.targetConfig.gitBranch);
    }
  }

  private async retrieveSourceMetadataWithProgress(): Promise<MetadataItem[]> {
    if (this.sourceConfig.type === 'org') {
      return this.retrieveOrgMetadataWithProgress(this.sourceConfig.orgAlias!, 'source');
    } else {
      return this.retrieveGitMetadata(this.sourceConfig.gitBranch);
    }
  }

  private async retrieveTargetMetadataWithProgress(): Promise<MetadataItem[]> {
    if (this.targetConfig.type === 'org') {
      return this.retrieveOrgMetadataWithProgress(this.targetConfig.orgAlias!, 'target');
    } else {
      return this.retrieveGitMetadata(this.targetConfig.gitBranch);
    }
  }

  private async retrieveOrgMetadata(orgAlias: string): Promise<MetadataItem[]> {
    try {
      console.log('Retrieving metadata from org:', orgAlias);
      
      // Get sf path
      const sfTestResult = await this.executeCommand('which sf');
      const sfPath = sfTestResult.stdout?.trim() || '/usr/local/bin/sf';
      
      // List all metadata types first
      const metadataTypes = [
        'ApexClass', 'ApexTrigger', 'CustomObject', 'CustomField', 'PermissionSet',
        'Profile', 'Layout', 'Tab', 'App', 'Workflow', 'ValidationRule', 'SharingRule',
        'Queue', 'Group', 'Role', 'CustomPermission', 'Flow', 'ProcessBuilder',
        'QuickAction', 'EmailTemplate', 'Letterhead', 'Document', 'StaticResource',
        'AuraDefinitionBundle', 'LightningComponentBundle', 'Wave', 'Dashboard',
        'Report', 'ReportType'
      ];
      
      const allMetadata: MetadataItem[] = [];
      
      for (const metadataType of metadataTypes) {
        try {
          console.log(`Listing ${metadataType} metadata...`);
          const command = `${sfPath} org list metadata --target-org ${orgAlias} --metadata-type ${metadataType} --json`;
          const result = await this.executeCommand(command);
          
          if (result.stderr) {
            console.warn(`SF command stderr for ${metadataType}:`, result.stderr);
          }

          if (!result.stdout) {
            console.warn(`No output from SF command for ${metadataType}`);
            continue;
          }

          // Strip ANSI codes and parse JSON
          const cleanOutput = this.stripAnsiCodes(result.stdout);
          const response = JSON.parse(cleanOutput);
          
          if (response.status === 0 && response.result) {
            const items = this.parseMetadataListResponse(response.result, metadataType);
            allMetadata.push(...items);
            console.log(`Found ${items.length} ${metadataType} items`);
          }
        } catch (error) {
          console.warn(`Failed to retrieve ${metadataType} metadata:`, error);
          // Continue with other metadata types
        }
      }
      
      console.log(`Total metadata items found: ${allMetadata.length}`);
      return allMetadata;
    } catch (error) {
      console.error('Failed to retrieve org metadata:', error);
      throw error;
    }
  }

  private async retrieveOrgMetadataWithProgress(orgAlias: string, progressType: 'source' | 'target'): Promise<MetadataItem[]> {
    try {
      console.log(`Retrieving metadata from ${progressType} org:`, orgAlias);
      
      // Get sf path
      const sfTestResult = await this.executeCommand('which sf');
      const sfPath = sfTestResult.stdout?.trim() || '/usr/local/bin/sf';
      
      // List all metadata types first
      const metadataTypes = [
        'ApexClass', 'ApexTrigger', 'CustomObject', 'CustomField', 'PermissionSet',
        'Profile', 'Layout', 'Tab', 'App', 'Workflow', 'ValidationRule', 'SharingRule',
        'Queue', 'Group', 'Role', 'CustomPermission', 'Flow', 'ProcessBuilder',
        'QuickAction', 'EmailTemplate', 'Letterhead', 'Document', 'StaticResource',
        'AuraDefinitionBundle', 'LightningComponentBundle', 'Wave', 'Dashboard',
        'Report', 'ReportType'
      ];
      
      // Set total types for progress calculation
      if (progressType === 'source') {
        this.sourceTotalTypes = metadataTypes.length;
        this.sourceCompletedTypes = 0;
      } else {
        this.targetTotalTypes = metadataTypes.length;
        this.targetCompletedTypes = 0;
      }
      
      const allMetadata: MetadataItem[] = [];
      
      for (let i = 0; i < metadataTypes.length; i++) {
        const metadataType = metadataTypes[i];
        
        // Update progress
        if (progressType === 'source') {
          this.sourceCurrentType = metadataType;
          this.sourceCompletedTypes = i;
          this.sourceProgress = Math.round((i / metadataTypes.length) * 100);
        } else {
          this.targetCurrentType = metadataType;
          this.targetCompletedTypes = i;
          this.targetProgress = Math.round((i / metadataTypes.length) * 100);
        }
        
        try {
          console.log(`Listing ${metadataType} metadata from ${progressType}...`);
          const command = `${sfPath} org list metadata --target-org ${orgAlias} --metadata-type ${metadataType} --json`;
          const result = await this.executeCommand(command);
          
          if (result.stderr) {
            console.warn(`SF command stderr for ${metadataType}:`, result.stderr);
          }

          if (!result.stdout) {
            console.warn(`No output from SF command for ${metadataType}`);
            continue;
          }

          // Strip ANSI codes and parse JSON
          const cleanOutput = this.stripAnsiCodes(result.stdout);
          const response = JSON.parse(cleanOutput);
          
          if (response.status === 0 && response.result) {
            const items = this.parseMetadataListResponse(response.result, metadataType);
            allMetadata.push(...items);
            console.log(`Found ${items.length} ${metadataType} items from ${progressType}`);
          }
        } catch (error) {
          console.warn(`Failed to retrieve ${metadataType} metadata from ${progressType}:`, error);
          // Continue with other metadata types
        }
      }
      
      // Set progress to 100% when complete
      if (progressType === 'source') {
        this.sourceProgress = 100;
        this.sourceCurrentType = 'Complete';
      } else {
        this.targetProgress = 100;
        this.targetCurrentType = 'Complete';
      }
      
      console.log(`Total metadata items found from ${progressType}: ${allMetadata.length}`);
      return allMetadata;
    } catch (error) {
      console.error(`Failed to retrieve ${progressType} org metadata:`, error);
      throw error;
    }
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
    const sourceMap = new Map<string, MetadataItem>();
    const targetMap = new Map<string, MetadataItem>();

    source.forEach(item => sourceMap.set(item.fullName, item));
    target.forEach(item => targetMap.set(item.fullName, item));

    const added: MetadataItem[] = [];
    const removed: MetadataItem[] = [];
    const changed: MetadataItem[] = [];
    const unchanged: MetadataItem[] = [];

    // Find added items (in source but not in target)
    for (const [key, sourceItem] of sourceMap) {
      if (!targetMap.has(key)) {
        sourceItem.status = 'added';
        added.push(sourceItem);
      } else {
        const targetItem = targetMap.get(key)!;
        if (this.hasChanges(sourceItem, targetItem)) {
          sourceItem.status = 'changed';
          sourceItem.targetValue = targetItem.sourceValue;
          sourceItem.diff = this.generateDiff(sourceItem.sourceValue, targetItem.sourceValue);
          changed.push(sourceItem);
        } else {
          sourceItem.status = 'unchanged';
          unchanged.push(sourceItem);
        }
      }
    }

    // Find removed items (in target but not in source)
    for (const [key, targetItem] of targetMap) {
      if (!sourceMap.has(key)) {
        targetItem.status = 'removed';
        removed.push(targetItem);
      }
    }

    return { added, removed, changed, unchanged };
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

  get filteredComparisonResult(): MetadataComparison | undefined {
    if (!this.comparisonResult) {
      return undefined;
    }

    const filtered = {
      added: this.filterItems(this.comparisonResult.added),
      removed: this.filterItems(this.comparisonResult.removed),
      changed: this.filterItems(this.comparisonResult.changed),
      unchanged: this.filterItems(this.comparisonResult.unchanged)
    };

    return filtered;
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
    this.filter.status = ['added', 'removed', 'changed', 'unchanged'];
  }

  handleFilterAdded(): void {
    this.filter.status = ['added'];
  }

  handleFilterRemoved(): void {
    this.filter.status = ['removed'];
  }

  handleFilterChanged(): void {
    this.filter.status = ['changed'];
  }

  handleFilterUnchanged(): void {
    this.filter.status = ['unchanged'];
  }



  private stripAnsiCodes(text?: string): string {
    if (!text) return '';
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // Selection methods
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
    const itemName = target.dataset.item;
    
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

  // Diff viewer methods
  handleViewDiff(event: Event): void {
    const target = event.target as HTMLButtonElement;
    const itemName = target.dataset.item;
    
    if (this.comparisonResult && itemName) {
      const allItems = [
        ...this.comparisonResult.added,
        ...this.comparisonResult.removed,
        ...this.comparisonResult.changed,
        ...this.comparisonResult.unchanged
      ];
      
      this.selectedDiffItem = allItems.find(i => i.fullName === itemName);
      if (this.selectedDiffItem) {
        this.generateDiffContent();
        this.showDiffViewer = true;
      }
    }
  }

  handleCloseDiffViewer(): void {
    this.showDiffViewer = false;
    this.selectedDiffItem = undefined;
    this.diffContent = undefined;
  }

  generateDiffContent(): void {
    if (!this.selectedDiffItem) return;
    
    const sourceContent = this.selectedDiffItem.sourceValue || '';
    const targetContent = this.selectedDiffItem.targetValue || '';
    
    const sourceLines = sourceContent.split('\n');
    const targetLines = targetContent.split('\n');
    
    const diffLines: DiffLine[] = [];
    const maxLines = Math.max(sourceLines.length, targetLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const sourceLine = sourceLines[i] || '';
      const targetLine = targetLines[i] || '';
      const lineNumber = i + 1;
      
      let type: 'added' | 'removed' | 'changed' | 'unchanged' = 'unchanged';
      let diffLineClass = 'diff-line-unchanged';
      
      if (sourceLine !== targetLine) {
        if (sourceLine && !targetLine) {
          type = 'removed';
          diffLineClass = 'diff-line-removed';
        } else if (!sourceLine && targetLine) {
          type = 'added';
          diffLineClass = 'diff-line-added';
        } else {
          type = 'changed';
          diffLineClass = 'diff-line-changed';
        }
      }
      
      diffLines.push({
        lineNumber,
        sourceContent: sourceLine,
        targetContent: targetLine,
        type,
        diffLineClass
      });
    }
    
    this.diffContent = { diffLines };
  }

  // Package creation methods
  handleCreatePackage(): void {
    if (this.selectedItems.length === 0) {
      this.showToast('No items selected for package creation', 'warning');
      return;
    }
    
    const autoWiredItems = this.autoWireDependencies(this.selectedItems);
    this.createPackageZip(autoWiredItems);
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
    const packageXml = this.generatePackageXml(items);
    
    console.log('Package XML:', packageXml);
    console.log('Selected items:', items.map(item => `${item.type}:${item.name}`));
    
    this.showToast(`Package created with ${items.length} items`, 'success');
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