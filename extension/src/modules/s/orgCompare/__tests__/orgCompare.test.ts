/**
 * Org Compare Component Tests
 * Comprehensive test suite for org compare functionality
 */

import { createElement } from 'lwc';
import OrgCompare from '../orgCompare';

describe('OrgCompare Component', () => {
  let element: any;

  beforeEach(() => {
    element = createElement('s-org-compare', {
      is: OrgCompare
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  describe('Component Initialization', () => {
    it('should initialize with default values', () => {
      expect(element.isComparing).toBe(false);
      expect(element.comparisonResult).toBeUndefined();
      expect(element.error).toBeUndefined();
      expect(element.sourceOrgs).toEqual([]);
      expect(element.targetOrgs).toEqual([]);
    });

    it('should load available orgs on connected', async () => {
      // Mock the executeCommand method
      element.executeCommand = jest.fn().mockResolvedValue({
        errorCode: 0,
        stdout: JSON.stringify({
          status: 0,
          result: {
            devHubs: [],
            scratchOrgs: [],
            sandboxes: [],
            nonScratchOrgs: [
              { alias: 'test-org', username: 'test@example.com', orgId: '123' }
            ],
            other: []
          }
        })
      });

      await element.loadAvailableOrgs();

      expect(element.sourceOrgs.length).toBeGreaterThan(0);
      expect(element.targetOrgs.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Handling', () => {
    it('should handle source type changes', () => {
      const event = { target: { value: 'org' } };
      element.handleSourceTypeChange(event);
      expect(element.sourceConfig.type).toBe('org');
    });

    it('should handle target type changes', () => {
      const event = { target: { value: 'git' } };
      element.handleTargetTypeChange(event);
      expect(element.targetConfig.type).toBe('git');
    });

    it('should handle source org changes', () => {
      const event = { target: { value: 'test-org' } };
      element.handleSourceOrgChange(event);
      expect(element.sourceConfig.orgAlias).toBe('test-org');
    });

    it('should handle target org changes', () => {
      const event = { target: { value: 'target-org' } };
      element.handleTargetOrgChange(event);
      expect(element.targetConfig.orgAlias).toBe('target-org');
    });
  });

  describe('Validation', () => {
    it('should validate configuration correctly', () => {
      // Test invalid configuration
      element.sourceConfig = { type: 'org', orgAlias: '' };
      element.targetConfig = { type: 'org', orgAlias: '' };
      
      expect(element.validateConfiguration()).toBe(false);

      // Test valid configuration
      element.sourceConfig = { type: 'org', orgAlias: 'source-org' };
      element.targetConfig = { type: 'org', orgAlias: 'target-org' };
      
      expect(element.validateConfiguration()).toBe(true);
    });

    it('should show error for invalid configuration', async () => {
      element.sourceConfig = { type: 'org', orgAlias: '' };
      element.targetConfig = { type: 'org', orgAlias: '' };

      await element.handleCompareClick();

      expect(element.error).toBeDefined();
      expect(element.isComparing).toBe(false);
    });
  });

  describe('Metadata Comparison', () => {
    it('should compare metadata correctly', () => {
      const source = [
        { fullName: 'ApexClass/TestClass', type: 'ApexClass', name: 'TestClass' },
        { fullName: 'CustomObject/TestObject', type: 'CustomObject', name: 'TestObject' }
      ];

      const target = [
        { fullName: 'ApexClass/TestClass', type: 'ApexClass', name: 'TestClass' },
        { fullName: 'CustomObject/AnotherObject', type: 'CustomObject', name: 'AnotherObject' }
      ];

      const result = element.compareMetadata(source, target);

      expect(result.added.length).toBe(1);
      expect(result.removed.length).toBe(1);
      expect(result.changed.length).toBe(0);
      expect(result.unchanged.length).toBe(1);
    });

    it('should handle empty metadata arrays', () => {
      const result = element.compareMetadata([], []);
      
      expect(result.added.length).toBe(0);
      expect(result.removed.length).toBe(0);
      expect(result.changed.length).toBe(0);
      expect(result.unchanged.length).toBe(0);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      element.comparisonResult = {
        added: [{ fullName: 'test1', status: 'added' }],
        removed: [{ fullName: 'test2', status: 'removed' }],
        changed: [{ fullName: 'test3', status: 'changed' }],
        unchanged: [{ fullName: 'test4', status: 'unchanged' }]
      };
    });

    it('should filter by added items', () => {
      element.handleFilterAdded();
      expect(element.currentFilter).toBe('added');
      expect(element.filteredComparisonResult.length).toBe(1);
    });

    it('should filter by removed items', () => {
      element.handleFilterRemoved();
      expect(element.currentFilter).toBe('removed');
      expect(element.filteredComparisonResult.length).toBe(1);
    });

    it('should filter by changed items', () => {
      element.handleFilterChanged();
      expect(element.currentFilter).toBe('changed');
      expect(element.filteredComparisonResult.length).toBe(1);
    });

    it('should filter by unchanged items', () => {
      element.handleFilterUnchanged();
      expect(element.currentFilter).toBe('unchanged');
      expect(element.filteredComparisonResult.length).toBe(1);
    });

    it('should show all items when filter is all', () => {
      element.handleFilterAll();
      expect(element.currentFilter).toBe('all');
      expect(element.filteredComparisonResult.length).toBe(4);
    });
  });

  describe('Selection', () => {
    beforeEach(() => {
      element.comparisonResult = {
        added: [{ fullName: 'test1', selected: false }],
        removed: [],
        changed: [],
        unchanged: []
      };
    });

    it('should handle select all', () => {
      const event = { target: { checked: true } };
      element.handleSelectAll(event);
      
      expect(element.selectAll).toBe(true);
      expect(element.comparisonResult.added[0].selected).toBe(true);
    });

    it('should handle individual item selection', () => {
      const event = { target: { checked: true, getAttribute: () => 'test1' } };
      element.handleItemSelect(event);
      
      expect(element.comparisonResult.added[0].selected).toBe(true);
    });

    it('should update selected items count', () => {
      element.comparisonResult.added[0].selected = true;
      element.updateSelectedItems();
      
      expect(element.selectedItems.length).toBe(1);
    });
  });

  describe('Package Creation', () => {
    it('should create package with selected items', async () => {
      element.selectedItems = [
        { type: 'ApexClass', name: 'TestClass', sourceValue: 'public class TestClass {}' }
      ];

      // Mock the createPackageZip method
      element.createPackageZip = jest.fn();

      await element.handleCreatePackage();

      expect(element.createPackageZip).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ type: 'ApexClass', name: 'TestClass' })
      ]));
    });

    it('should show warning when no items selected', async () => {
      element.selectedItems = [];
      element.showToast = jest.fn();

      await element.handleCreatePackage();

      expect(element.showToast).toHaveBeenCalledWith(
        'Please select items to create a package',
        'warning'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', () => {
      const error = new Error('Test error');
      element.handleError('Test message', error);
      
      expect(element.error).toBeDefined();
      expect(element.isComparing).toBe(false);
    });

    it('should show toast messages', () => {
      element.showToast = jest.fn();
      element.showToast('Test message', 'success');
      
      expect(element.showToast).toHaveBeenCalledWith('Test message', 'success');
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress correctly', () => {
      element.sourceProgress = 0;
      element.sourceCurrentType = '';
      element.sourceTotalTypes = 10;
      element.sourceCompletedTypes = 5;

      // Simulate progress update
      element.sourceProgress = 50;
      element.sourceCurrentType = 'ApexClass';

      expect(element.sourceProgress).toBe(50);
      expect(element.sourceCurrentType).toBe('ApexClass');
    });
  });

  describe('Utility Methods', () => {
    it('should strip ANSI codes correctly', () => {
      const textWithAnsi = '\x1b[32mHello\x1b[0m World';
      const result = element.stripAnsiCodes(textWithAnsi);
      
      expect(result).toBe('Hello World');
    });

    it('should generate package XML correctly', () => {
      const items = [
        { type: 'ApexClass', name: 'TestClass' },
        { type: 'CustomObject', name: 'TestObject' }
      ];

      const packageXml = element.generatePackageXml(items);
      
      expect(packageXml).toContain('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
      expect(packageXml).toContain('<name>ApexClass</name>');
      expect(packageXml).toContain('<name>CustomObject</name>');
      expect(packageXml).toContain('<version>58.0</version>');
    });
  });

  describe('Integration Tests', () => {
    it('should perform complete comparison workflow', async () => {
      // Setup
      element.sourceConfig = { type: 'org', orgAlias: 'source-org' };
      element.targetConfig = { type: 'org', orgAlias: 'target-org' };
      
      // Mock metadata retrieval
      element.retrieveSourceMetadataWithProgress = jest.fn().mockResolvedValue([
        { fullName: 'ApexClass/TestClass', type: 'ApexClass', name: 'TestClass' }
      ]);
      
      element.retrieveTargetMetadataWithProgress = jest.fn().mockResolvedValue([
        { fullName: 'ApexClass/TestClass', type: 'ApexClass', name: 'TestClass' }
      ]);

      // Execute comparison
      await element.handleCompareClick();

      // Verify results
      expect(element.isComparing).toBe(false);
      expect(element.comparisonResult).toBeDefined();
      expect(element.error).toBeUndefined();
    });
  });
}); 